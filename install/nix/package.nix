{
  lib,
  stdenvNoCC,
  fetchurl,
  nix-update-script,
  withFonts ? true,
}:
let
  version = "0.1.0-rc.8";
  fonts = fetchurl {
    url = "https://github.com/Zakkaus/doona/releases/download/v${version}/doona-fonts-${version}.tar.gz";
    hash = "sha256-gm/hYixS5hllFXiCteqqq3W9PECxv0Tu135NZalmHms=";
  };
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "doona";
  inherit version;

  src = fetchurl {
    url = "https://github.com/Zakkaus/doona/releases/download/v${finalAttrs.version}/doona-${finalAttrs.version}.tar.gz";
    hash = "sha256-c/y818/rXD4Q4svwO3CRH4s66b+8NzddcorHcHYPGdw=";
  };

  dontUnpack = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/doona
    tar -xzf $src -C $out/share/doona
  ''
  + lib.optionalString withFonts ''
    tar -xzf ${fonts} -C $out/share/doona
  ''
  + ''
    runHook postInstall
  '';

  passthru.updateScript = nix-update-script { };

  meta = {
    description = "Web UI for the daeuniverse engines";
    homepage = "https://github.com/Zakkaus/doona";
    # lib.licenses has no entry for the GitHub mark's logo terms, which LICENSES/LicenseRef-GitHub-Logos.txt holds.
    license =
      with lib.licenses;
      [ agpl3Only gpl3Only bsd0 asl20 bsd3 isc mit cc-by-30 cc-by-40 cc-by-sa-40 cc0 ] ++ lib.optional withFonts ofl;
    platforms = lib.platforms.linux;
    # Needs a maintainers/maintainer-list.nix entry in its own commit before submission.
    maintainers = with lib.maintainers; [ zakkaus ];
  };
})
