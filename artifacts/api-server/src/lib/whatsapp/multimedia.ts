import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openai } from "@workspace/integrations-openai-ai-server";
import OpenAI, { toFile } from "openai";

/**
 * Convert any audio (ogg/opus/m4a/etc) to wav with ffmpeg so Whisper accepts it.
 */
async function convertToWav(audioBuffer: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `wa-in-${randomUUID()}`);
  const outputPath = join(tmpdir(), `wa-out-${randomUUID()}.wav`);
  try {
    await writeFile(inputPath, audioBuffer);
    await new Promise<void>((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-i", inputPath,
        "-vn",
        "-f", "wav",
        "-ar", "16000",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-y",
        outputPath,
      ]);
      let err = "";
      ff.stderr.on("data", (d) => (err += d.toString()));
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${err.slice(0, 200)}`));
      });
      ff.on("error", reject);
    });
    const { readFile } = await import("node:fs/promises");
    return await readFile(outputPath);
  } finally {
    unlink(inputPath).catch(() => {});
    unlink(outputPath).catch(() => {});
  }
}

export async function transcribeAudioBase64(
  base64: string,
  mimetype = "audio/ogg",
): Promise<{ text?: string; error?: string }> {
  try {
    const buf = Buffer.from(base64, "base64");
    const wav = await convertToWav(buf);
    const file = await toFile(wav, "audio.wav", { type: "audio/wav" });
    const result = await (openai as OpenAI).audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
    });
    return { text: result.text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "transcribe failed" };
  }
}

export async function describeImageBase64(
  base64: string,
  mimetype = "image/jpeg",
  caption?: string,
): Promise<{ description?: string; error?: string }> {
  try {
    const result = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Describes images sent by WhatsApp customers. Identify clearly the main subject, any text visible, product issues, screenshots of errors, receipts, IDs, or anything actionable for customer service. Be concise (3-5 sentences). Respond in Spanish unless image content suggests another language.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: caption
                ? `Caption del cliente: "${caption}". Describe la imagen.`
                : "Describe esta imagen para servicio al cliente.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimetype};base64,${base64}`,
              },
            },
          ],
        },
      ],
    });
    return { description: result.choices[0]?.message?.content ?? "" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "vision failed" };
  }
}
