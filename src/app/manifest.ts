import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QueuedToGo",
    short_name: "QueuedToGo",
    description: "Order forms, ticket sales and RSVP invitations for live events, with a production board and automatic customer updates.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#3346D3",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
