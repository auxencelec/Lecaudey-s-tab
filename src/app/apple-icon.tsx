import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 92,
          fontWeight: 700,
          letterSpacing: -4,
        }}
      >
        Lt
      </div>
    ),
    size
  );
}
