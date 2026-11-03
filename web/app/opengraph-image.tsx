import { ImageResponse } from "next/og";

// The picture shown when a link to the site is shared (Messages, Facebook,
// Slack). Shop pages use it too unless they have their own.
export const alt = "The Candy Lady: neighborhood snacks you can walk to";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #fff8ef 0%, #ffd84d 100%)",
          color: "#44251d",
        }}
      >
        <div style={{ display: "flex", alignSelf: "flex-start", background: "#d6304f", color: "#fff", borderRadius: 999, padding: "16px 40px", fontSize: 64, fontWeight: 800 }}>
          The Candy Lady
        </div>
        <div style={{ marginTop: 48, fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>Neighborhood snacks you can walk to.</div>
        <div style={{ marginTop: 24, fontSize: 36 }}>Order from a shop near you, pay by card, pick up with a code.</div>
      </div>
    ),
    size,
  );
}
