import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = {
  width: 1200,
  height: 630,
};

async function getLogoDataUrl() {
  const logoPath = path.join(process.cwd(), "public", "brand", "jz-logo.png");
  const file = await readFile(logoPath);
  return `data:image/png;base64,${file.toString("base64")}`;
}

export default async function OpenGraphImage() {
  const logoDataUrl = await getLogoDataUrl();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background:
            "radial-gradient(circle at top right, rgba(82,82,91,0.34), transparent 45%), radial-gradient(circle at bottom left, rgba(16,185,129,0.15), transparent 42%), #09090B",
          color: "#F4F4F5",
          padding: "52px",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", maxWidth: "74%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                border: "1px solid rgba(63,63,70,0.85)",
                borderRadius: "999px",
                padding: "10px 16px",
                fontSize: "22px",
                color: "#A1A1AA",
              }}
            >
              api.jzuv.my.id
            </div>
            <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 }}>
              JzREST API
            </div>
            <div style={{ fontSize: 34, color: "#D4D4D8" }}>
              High-performance API services for modern apps
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: 24, color: "#A1A1AA" }}>
            <div
              style={{
                display: "inline-flex",
                height: "12px",
                width: "12px",
                borderRadius: "999px",
                background: "#10B981",
              }}
            />
            Secure dashboard, API key management, and scalable plans
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "250px",
            height: "250px",
            borderRadius: "28px",
            border: "1px solid rgba(63,63,70,0.85)",
            background: "rgba(9,9,11,0.6)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoDataUrl}
            alt="JzREST API Logo"
            width="200"
            height="200"
            style={{ borderRadius: "16px" }}
          />
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
