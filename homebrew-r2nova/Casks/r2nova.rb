cask "r2nova" do
  version "0.1.0"
  sha256 :no_check

  url "https://github.com/r2nova/r2nova/releases/download/v#{version}/r2nova_#{version}_aarch64.dmg"
  name "r2nova"
  desc "Cloudflare R2 desktop client"
  homepage "https://github.com/r2nova/r2nova"

  depends_on macos: ">= :ventura"

  app "r2nova.app"

  zap trash: [
    "~/Library/Application Support/io.r2nova.app",
    "~/Library/Caches/io.r2nova.app",
    "~/Library/Logs/io.r2nova.app",
  ]
end
