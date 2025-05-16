import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const { content, filename } = await req.json();
  const dir = path.join(process.cwd(), "public", "exports");
  const filePath = path.join(dir, filename);

  // Ensure the directory exists
  await mkdir(path.dirname(filePath), { recursive: true });

  await writeFile(filePath, content, "utf8");
  return NextResponse.json({ url: `/exports/${filename}` });
}
