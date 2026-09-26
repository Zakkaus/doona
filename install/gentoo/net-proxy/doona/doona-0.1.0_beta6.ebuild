# Copyright 2026 Gentoo Authors
# Distributed under the terms of the GNU General Public License v2

EAPI=8

MY_VERSION="${PV/_alpha/-alpha.}"
MY_VERSION="${MY_VERSION/_beta/-beta.}"
MY_VERSION="${MY_VERSION/_rc/-rc.}"
MY_TAG="v${MY_VERSION}"
MY_URI="https://github.com/Zakkaus/doona/releases/download/${MY_TAG}"
DESCRIPTION="Web UI for the daeuniverse engines"
HOMEPAGE="https://github.com/Zakkaus/doona"
SRC_URI="
	${MY_URI}/${PN}-${MY_VERSION}.tar.gz -> ${P}.tar.gz
	fonts? ( ${MY_URI}/${PN}-fonts-${MY_VERSION}.tar.gz -> ${P}-fonts.tar.gz )
"
S="${WORKDIR}"

# The built files bundle npm packages under these licenses.
LICENSE="GPL-3 0BSD Apache-2.0 BSD ISC MIT fonts? ( OFL-1.1 )"
SLOT="0"
KEYWORDS="~alpha ~amd64 ~arm ~arm64 ~hppa ~loong ~m68k ~mips ~ppc ~ppc64 ~riscv ~s390 ~sparc ~x86"
IUSE="+fonts"

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
