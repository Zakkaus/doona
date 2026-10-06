# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2026 Zakkaus

include $(TOPDIR)/rules.mk

PKG_NAME:=doona
PKG_REAL_VERSION:=0.1.0-beta.16
PKG_VERSION:=$(subst -beta.,_beta,$(PKG_REAL_VERSION))
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_REAL_VERSION).tar.gz
PKG_SOURCE_URL:=https://github.com/Zakkaus/doona/releases/download/v$(PKG_REAL_VERSION)/
PKG_HASH:=5e8a5db1c12ebb780adf293214f68b8c19f85738cb9a015ba4ea3c0f9614c7a6

PKG_LICENSE:=GPL-3.0-only 0BSD Apache-2.0 BSD-3-Clause ISC MIT CC-BY-3.0 CC-BY-4.0 CC-BY-SA-4.0 CC0-1.0 LicenseRef-GitHub-Logos
PKG_LICENSE_FILES:=web/LICENSE
PKG_MAINTAINER:=Zakkaus <zakk@gentoozh.org>

include $(INCLUDE_DIR)/package.mk

FONTS_FILE:=$(PKG_NAME)-fonts-$(PKG_REAL_VERSION).tar.gz
define Download/doona-fonts
	URL:=https://github.com/Zakkaus/doona/releases/download/v$(PKG_REAL_VERSION)/
	URL_FILE:=$(FONTS_FILE)
	FILE:=$(FONTS_FILE)
	HASH:=d18f268887c5b3e69dacb349405360e65729eb24798c54a03703ee089d204d30
endef

PRECOMPRESSED_FILE:=$(PKG_NAME)-precompressed-$(PKG_REAL_VERSION).tar.gz
define Download/doona-precompressed
	URL:=https://github.com/Zakkaus/doona/releases/download/v$(PKG_REAL_VERSION)/
	HASH:=a557fe3bc6d05bd4d8ac1efd481dc04fddf6ec62b78d0d532ee8d148017ba6f3
	URL_FILE:=$(PRECOMPRESSED_FILE)
	FILE:=$(PRECOMPRESSED_FILE)
endef

define Package/doona/template
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  URL:=https://github.com/Zakkaus/doona
  PKGARCH:=all
endef

define Package/doona
  $(call Package/doona/template)
  TITLE:=Web UI for the daeuniverse engines
endef

define Package/doona/description
  Static files for the doona web interface, installed under /usr/share/doona.
  Point the engine's native API ui setting (honk: experimental.native_api.ui) at that directory, or serve it with a web server.
endef

define Package/doona-fonts
  $(call Package/doona/template)
  TITLE:=Noto Sans TC/SC for doona
  DEPENDS:=+doona
  LICENSE:=OFL-1.1
endef

define Package/doona-fonts/description
  The optional Noto Sans TC and SC subset doona loads when present.
endef

define Package/doona-precompressed
  $(call Package/doona/template)
  TITLE:=Precompressed assets for doona
  DEPENDS:=+doona
  EXTRA_DEPENDS:=doona (=$(PKG_VERSION)-r$(PKG_RELEASE))
endef

define Package/doona-precompressed/description
  Brotli and gzip copies of doona's text assets, so the engine or a web server can send compressed responses.
endef

define Build/Prepare
	( \
		mkdir -p $(PKG_BUILD_DIR)/web ; \
		gzip -dc $(DL_DIR)/$(PKG_SOURCE) | $(HOST_TAR) -C $(PKG_BUILD_DIR)/web $(TAR_OPTIONS) ; \
	)
	( \
		mkdir -p $(PKG_BUILD_DIR)/fonts ; \
		gzip -dc $(DL_DIR)/$(FONTS_FILE) | $(HOST_TAR) -C $(PKG_BUILD_DIR)/fonts $(TAR_OPTIONS) ; \
	)
	( \
		mkdir -p $(PKG_BUILD_DIR)/precompressed ; \
		gzip -dc $(DL_DIR)/$(PRECOMPRESSED_FILE) | $(HOST_TAR) -C $(PKG_BUILD_DIR)/precompressed $(TAR_OPTIONS) ; \
	)
endef

define Build/Compile
endef

define Package/doona/install
	$(INSTALL_DIR) $(1)/usr/share/doona
	$(CP) $(PKG_BUILD_DIR)/web/* $(1)/usr/share/doona/
	$(INSTALL_DIR) $(1)/usr/share/doc/doona
	$(CP) $(PKG_BUILD_DIR)/web/LICENSE $(PKG_BUILD_DIR)/web/LICENSES $(PKG_BUILD_DIR)/web/NOTICE $(1)/usr/share/doc/doona/
	rm -rf $(1)/usr/share/doona/LICENSE $(1)/usr/share/doona/LICENSES $(1)/usr/share/doona/NOTICE $(1)/usr/share/doona/*.md
endef

define Package/doona-fonts/install
	$(INSTALL_DIR) $(1)/usr/share/doona/fonts
	$(CP) $(PKG_BUILD_DIR)/fonts/fonts/* $(1)/usr/share/doona/fonts/
endef

define Package/doona-precompressed/install
	$(INSTALL_DIR) $(1)/usr/share/doona
	$(CP) $(PKG_BUILD_DIR)/precompressed/* $(1)/usr/share/doona/
endef

$(eval $(call Download,doona-fonts))
$(eval $(call Download,doona-precompressed))
$(eval $(call BuildPackage,doona))
$(eval $(call BuildPackage,doona-fonts))
$(eval $(call BuildPackage,doona-precompressed))
