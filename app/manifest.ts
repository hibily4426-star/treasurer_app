import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KINARI BOOTH REGISTER",
    short_name: "KINARI POS",
    description: "ブース売上管理・レジシステム",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F5F2",
    theme_color: "#17211E",
    lang: "ja",
  };
}
