# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2026 Zakkaus

include $(TOPDIR)/rules.mk

PKG_NAME:=doona
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-v$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://github.com/Zakkaus/doona/releases/download/v$(PKG_VERSION)/
PKG_HASH:=skip

PKG_LICENSE:=GPL-3.0-only
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=Zakkaus <zakk@gentoozh.org>

include $(INCLUDE_DIR)/package.mk

FONTS_FILE:=$(PKG_NAME)-fonts-v$(PKG_VERSION).tar.gz
define Download/doona-fonts
	URL:=https://github.com/Zakkaus/doona/releases/download/v$(PKG_VERSION)/
	URL_FILE:=$(FONTS_FILE)
	FILE:=$(FONTS_FILE)
	HASH:=skip
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
  Point the engine's ui setting at that directory.
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

define Build/Prepare
	( \
		mkdir -p $(PKG_BUILD_DIR)/web ; \
		gzip -dc $(DL_DIR)/$(PKG_SOURCE) | $(HOST_TAR) -C $(PKG_BUILD_DIR)/web $(TAR_OPTIONS) ; \
	)
ifneq ($(CONFIG_PACKAGE_doona-fonts),)
	$(call Download,doona-fonts)
	( \
		mkdir -p $(PKG_BUILD_DIR)/fonts ; \
		gzip -dc $(DL_DIR)/$(FONTS_FILE) | $(HOST_TAR) -C $(PKG_BUILD_DIR)/fonts $(TAR_OPTIONS) ; \
	)
endif
endef

define Build/Compile
endef

define Package/doona/install
	$(INSTALL_DIR) $(1)/usr/share/doona
	$(CP) $(PKG_BUILD_DIR)/web/* $(1)/usr/share/doona/
	rm -f $(1)/usr/share/doona/LICENSE $(1)/usr/share/doona/NOTICE $(1)/usr/share/doona/*.md
endef

define Package/doona-fonts/install
	$(INSTALL_DIR) $(1)/usr/share/doona/fonts
	$(CP) $(PKG_BUILD_DIR)/fonts/fonts/* $(1)/usr/share/doona/fonts/
endef

$(eval $(call BuildPackage,doona))
$(eval $(call BuildPackage,doona-fonts))
