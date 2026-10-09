import {Button, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Text} from 'react-aria-components';
import {useT} from '../i18n';
import LinkOut from './icons/LinkOut';
import './styles/ip-lookup.css';

// A public address that opens a menu of lookup sites; nothing leaves the page until the viewer picks one.
export function IpLookup({ip, address, sites}: {ip: string; address: string; sites: {name: string; href: string}[]}) {
  const t = useT();
  const title = t('ip.lookupTitle', {ip});
  return (
    <MenuTrigger>
      <Button className="rp-link rp-ip-lookup" data-layout="inline">
        {address}
        <LinkOut />
      </Button>
      <Popover className="rp-popover rp-list-popover rp-ip-lookup-menu" placement="bottom start">
        <Menu>
          <MenuSection>
            <Header className="rp-sec-h rp-ip-lookup-head">
              {title}
              <span className="desc">{t('ip.lookupNote')}</span>
            </Header>
            {sites.map(site => (
              <MenuItem key={site.name} id={site.name} href={site.href} target="_blank" rel="noreferrer" className="rp-item plain" textValue={site.name}>
                <span className="rp-item-text">
                  <Text slot="label">{site.name}</Text>
                </span>
                <LinkOut />
              </MenuItem>
            ))}
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
