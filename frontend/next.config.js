/** @type {import('next').NextConfig} */
const nextConfig = {
  // empacota só o necessário para rodar: a imagem de produção não leva
  // node_modules inteiro
  output: "standalone",
};

module.exports = nextConfig;
