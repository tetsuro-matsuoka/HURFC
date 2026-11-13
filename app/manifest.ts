import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ALL-IN",
    short_name: "ALL-IN",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon.png.jpg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
