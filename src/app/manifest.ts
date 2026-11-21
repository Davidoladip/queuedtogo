import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QueuedToGo",
    short_name: "QueuedToGo",
    description: "Order forms for live events that turn every submission into a tracked production job.",
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
