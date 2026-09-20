# Packagers' entry points. `make build` needs the dependencies installed (`make deps`, offline when a store
# or a deps tarball is present); `make install` copies the built files, `make install-fonts` the optional
# Noto Sans TC/SC. Both honour DESTDIR and PREFIX.
PREFIX ?= /usr
DESTDIR ?=
DATADIR = $(DESTDIR)$(PREFIX)/share/doona
DOCDIR = $(DESTDIR)$(PREFIX)/share/doc/doona
INSTALL ?= install

.PHONY: deps build check install install-fonts package

deps:
	pnpm install --frozen-lockfile --offline || pnpm install --frozen-lockfile

build:
	pnpm build

check:
	pnpm check

# Everything in dist/ except the fonts, plus the licence and notices.
install:
	@test -f dist/index.html || { echo 'run make build first' >&2; exit 1; }
	find dist -path dist/fonts -prune -o -type f -print | while read -r f; do \
		$(INSTALL) -Dm644 "$$f" "$(DATADIR)/$${f#dist/}"; \
	done
	$(INSTALL) -Dm644 LICENSE "$(DOCDIR)/LICENSE"
	$(INSTALL) -Dm644 NOTICE "$(DOCDIR)/NOTICE"
	$(INSTALL) -Dm644 README.md "$(DOCDIR)/README.md"
	$(INSTALL) -Dm644 CHANGELOG.md "$(DOCDIR)/CHANGELOG.md"

install-fonts:
	@test -d dist/fonts || { echo 'run make build first' >&2; exit 1; }
	find dist/fonts -type f | while read -r f; do \
		$(INSTALL) -Dm644 "$$f" "$(DATADIR)/$${f#dist/}"; \
	done
	$(INSTALL) -Dm644 public/fonts/OFL.txt "$(DOCDIR)/OFL.txt"

package:
	tools/package.sh
