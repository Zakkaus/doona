# Copyright 2026 Gentoo Authors
# Distributed under the terms of the GNU General Public License v2

EAPI=8

# The release tag keeps honk's dotted shape: v0.3.0.beta.1 for 0.3.0_beta1.
MY_TAG="v$(ver_rs 4 . "${PV/_/.}")"
MY_URI="https://github.com/Zakkaus/doona/releases/download/${MY_TAG}"
DESCRIPTION="Web UI for the daeuniverse engines"
HOMEPAGE="https://github.com/Zakkaus/doona"
SRC_URI="
	${MY_URI}/${PN}-${MY_TAG}.tar.gz -> ${P}.tar.gz
	fonts? ( ${MY_URI}/${PN}-fonts-${MY_TAG}.tar.gz -> ${P}-fonts.tar.gz )
"
S="${WORKDIR}"

LICENSE="GPL-3 fonts? ( OFL-1.1 )"
SLOT="0"
KEYWORDS="~amd64 ~arm64"
IUSE="+fonts"

src_install() {
	dodoc NOTICE README.md CHANGELOG.md
	rm LICENSE NOTICE README.md CHANGELOG.md || die
	insinto /usr/share/"${PN}"
	doins -r .
}

pkg_postinst() {
	elog "Point the engine's ui setting at /usr/share/${PN}, or serve that directory with any web server."
}
