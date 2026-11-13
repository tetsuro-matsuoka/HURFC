import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ALL-IN",
    short_name: "ALL-IN",
    start_url: "/",
    display: "standalone",
    background_color: "#0b111e",
    theme_color: "#0b111e",
    icons: [
      {
        src: "/icon.png.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/icon.png.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "maskable",
      },
    ],
  };
}
