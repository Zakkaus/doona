# nixpkgs-style expression for the release archives: `callPackage ./package.nix { }`.
# Both archives hold their files at the root, so each is unpacked into its own directory.
{
  lib,
  stdenvNoCC,
  fetchurl,
  withFonts ? true,
}:

stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "doona";
  version = "0.1.0";

  src = fetchurl {
    url = "https://github.com/Zakkaus/doona/releases/download/v${finalAttrs.version}/doona-v${finalAttrs.version}.tar.gz";
    hash = "";
  };

  fonts = fetchurl {
    url = "https://github.com/Zakkaus/doona/releases/download/v${finalAttrs.version}/doona-fonts-v${finalAttrs.version}.tar.gz";
    hash = "";
  };

  unpackPhase = ''
    runHook preUnpack
    mkdir source
    tar -xzf $src -C source
    runHook postUnpack
  '';
  sourceRoot = "source";

  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/doona $out/share/doc/doona
    cp -r . $out/share/doona
    mv $out/share/doona/{LICENSE,NOTICE,README.md,CHANGELOG.md} $out/share/doc/doona/
  ''
  + lib.optionalString withFonts ''
    tar -xzf ${finalAttrs.fonts} -C $out/share/doona
    mv $out/share/doona/fonts/OFL.txt $out/share/doc/doona/
  ''
  + ''
    runHook postInstall
  '';

  meta = {
    description = "Web UI for the daeuniverse engines";
    homepage = "https://github.com/Zakkaus/doona";
    license = with lib.licenses; [ gpl3Only ] ++ lib.optional withFonts ofl;
    platforms = lib.platforms.all;
  };
})
