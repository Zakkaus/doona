# Copyright 2026 Gentoo Authors
# Distributed under the terms of the GNU General Public License v2

EAPI=8

MY_VERSION="${PV/_beta/-beta.}"
MY_TAG="v${MY_VERSION}"
MY_URI="https://github.com/Zakkaus/doona/releases/download/${MY_TAG}"
DESCRIPTION="Web UI for the daeuniverse engines"
HOMEPAGE="https://github.com/Zakkaus/doona"
SRC_URI="
	${MY_URI}/${PN}-${MY_VERSION}.tar.gz -> ${P}.tar.gz
	fonts? ( ${MY_URI}/${PN}-fonts-${MY_VERSION}.tar.gz -> ${P}-fonts.tar.gz )
"
S="${WORKDIR}"

LICENSE="GPL-3 fonts? ( OFL-1.1 )"
SLOT="0"
KEYWORDS="~amd64 ~arm64"
IUSE="+fonts"
RESTRICT="strip"

src_install() {
	dodoc NOTICE README.md CHANGELOG.md
	dodoc -r LICENSES
	rm -r LICENSE LICENSES NOTICE README.md CHANGELOG.md || die
	insinto /usr/share/"${PN}"
	doins -r .
}

pkg_postinst() {
	elog "Point the engine's ui setting at /usr/share/${PN}, or serve that directory with any web server."
}
