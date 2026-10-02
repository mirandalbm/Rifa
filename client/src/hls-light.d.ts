// A versão "light" do hls.js (sem legendas nem DRM) não traz tipos próprios: são os da completa.
declare module "hls.js/light" {
  export { default } from "hls.js";
}
