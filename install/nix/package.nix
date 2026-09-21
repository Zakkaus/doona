# nixpkgs-style expression, built from source the way nixpkgs builds daed's web UI: the pnpm store is a
# fixed-output derivation, the build runs offline, `make install` lays out $out/share/doona.
{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpm_11,
  nodejs,
  withFonts ? true,
}:
let
  pnpm = pnpm_11;
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "doona";
  version = "0.1.0-beta.1";

  src = fetchFromGitHub {
    owner = "Zakkaus";
    repo = "doona";
    tag = "v${finalAttrs.version}";
    hash = lib.fakeHash; # Placeholder: replace with the published tag's source hash.
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 4;
    hash = lib.fakeHash; # Placeholder: replace with the pnpm dependency hash after publication.
  };

  nativeBuildInputs = [
    nodejs
    pnpmConfigHook
    pnpm
  ];

  buildPhase = ''
    runHook preBuild

    pnpm build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    make install PREFIX=$out
  ''
  + lib.optionalString withFonts ''
    make install-fonts PREFIX=$out
  ''
  + ''
    runHook postInstall
  '';

  meta = {
    description = "Web UI for the daeuniverse engines";
    homepage = "https://github.com/Zakkaus/doona";
    license = with lib.licenses; [ gpl3Only ] ++ lib.optional withFonts ofl;
    platforms = lib.platforms.linux;
  };
})
