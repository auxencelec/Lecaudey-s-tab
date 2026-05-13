import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#ffffff",
          fontSize: 260,
          fontWeight: 700,
          letterSpacing: -10,
        }}
      >
        Lt
      </div>
    ),
    { width: 512, height: 512 }
  );
}
