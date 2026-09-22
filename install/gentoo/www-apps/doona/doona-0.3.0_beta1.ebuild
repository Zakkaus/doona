# Copyright 2026 Gentoo Authors
# Distributed under the terms of the GNU General Public License v2

EAPI=8

# The release tag keeps honk's dotted shape: v0.3.0.beta.1 for 0.3.0_beta1.
MY_TAG="v$(ver_rs 4 . "${PV/_/.}")"
DESCRIPTION="Web UI for the daeuniverse engines"
HOMEPAGE="https://github.com/Zakkaus/doona"
SRC_URI="
	https://github.com/Zakkaus/doona/releases/download/${MY_TAG}/${PN}-${MY_TAG}.tar.gz
	fonts? ( https://github.com/Zakkaus/doona/releases/download/${MY_TAG}/${PN}-fonts-${MY_TAG}.tar.gz )
"
S="${WORKDIR}"

LICENSE="GPL-3 fonts? ( OFL-1.1 )"
SLOT="0"
KEYWORDS="~amd64 ~arm64 ~riscv"
IUSE="+fonts"

# Both archives hold their files at the root: unpack each into its own directory.
src_unpack() {
	mkdir web || die
	tar -xzf "${DISTDIR}/${PN}-${MY_TAG}.tar.gz" -C web || die
	if use fonts; then
		mkdir fonts || die
		tar -xzf "${DISTDIR}/${PN}-fonts-${MY_TAG}.tar.gz" -C fonts || die
	fi
}

src_install() {
	insinto /usr/share/doona
	doins -r web/.
	rm -f "${ED}"/usr/share/doona/{LICENSE,NOTICE,README.md,CHANGELOG.md} || die
	if use fonts; then
		doins -r fonts/fonts
	fi
	dodoc web/NOTICE web/README.md web/CHANGELOG.md
}

pkg_postinst() {
	elog "The files are installed under /usr/share/doona; point the engine's ui setting at that directory"
	elog "or serve it with any web server."
}
