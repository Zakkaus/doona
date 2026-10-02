{
  lib,
  stdenvNoCC,
  fetchurl,
  nix-update-script,
  withFonts ? true,
}:
let
  version = "0.1.0-beta.13";
  fonts = fetchurl {
    url = "https://github.com/Zakkaus/doona/releases/download/v${version}/doona-fonts-${version}.tar.gz";
    hash = lib.fakeHash; # Replace with the published font archive hash.
  };
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "doona";
  inherit version;

  src = fetchurl {
    url = "https://github.com/Zakkaus/doona/releases/download/v${finalAttrs.version}/doona-${finalAttrs.version}.tar.gz";
    hash = lib.fakeHash; # Replace with the published program archive hash.
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
      [ gpl3Only bsd0 asl20 bsd3 isc mit cc-by-30 cc-by-40 cc-by-sa-40 cc0 ] ++ lib.optional withFonts ofl;
    platforms = lib.platforms.linux;
    # Needs a maintainers/maintainer-list.nix entry in its own commit before submission.
    maintainers = with lib.maintainers; [ zakkaus ];
  };
})
