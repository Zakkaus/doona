import {useRef, useState} from 'react';
import {useT} from '../../i18n';
import {Button, TextField, toast} from '../../ui/ui';
import {iconSource, setIconOverrides, useIconOverrides} from '../../ui/brand';
import Close from '../../ui/icons/Close';

const uploadSize = 64;

// Reads a picked image and shrinks it to icon size, so the mapping stays small enough for localStorage.
async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = uploadSize;
  const context = canvas.getContext('2d')!;
  const scale = Math.min(uploadSize / bitmap.width, uploadSize / bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  context.drawImage(bitmap, (uploadSize - width) / 2, (uploadSize - height) / 2, width, height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}

// The user's own group and node icons, kept in this browser: a name and an http(s) URL or an uploaded image. Mirrors the custom-icon list Clash Meta dashboards offer.
export function CustomIcons() {
  const t = useT();
  const overrides = useIconOverrides();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const valid = name.trim() !== '' && iconSource(icon.trim()) !== null;
  const add = () => {
    const entry = {name: name.trim(), icon: icon.trim()};
    setIconOverrides([...overrides.filter(item => item.name !== entry.name), entry]);
    setName('');
    setIcon('');
  };
  return (
    <>
      <div className="rp-toolbar top">
        <TextField label={t('settings.iconName')} value={name} width={200} placeholder={t('settings.iconNamePlaceholder')} onChange={setName} />
        <TextField
          label={t('settings.iconValue')}
          value={icon}
          width={360}
          placeholder="https://…"
          onChange={setIcon}
          isInvalid={icon.trim() !== '' && iconSource(icon.trim()) === null}
          description={t('settings.iconValueHelp')}
        />
        <Button onPress={() => file.current?.click()}>{t('settings.iconUpload')}</Button>
        <Button accent isDisabled={!valid} onPress={add}>
          {t('settings.iconAdd')}
        </Button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={event => {
            const picked = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!picked) return;
            toDataUrl(picked).then(setIcon, () => toast('negative', t('settings.iconUploadFailed')));
          }}
        />
      </div>
      {overrides.length > 0 && (
        <div className="rp-list">
          {overrides.map(item => {
            const src = iconSource(item.icon);
            return (
              <div className="rp-row" key={item.name}>
                <span className="rp-chain">
                  {src && <img className="flag brand" src={src} alt="" />}
                  <strong>{item.name}</strong>
                  <span className="rp-code rp-truncate">{item.icon.startsWith('data:') ? t('settings.iconUploaded') : item.icon}</span>
                </span>
                <Button
                  quiet
                  small
                  label={t('settings.iconRemove', {name: item.name})}
                  onPress={() => setIconOverrides(overrides.filter(other => other.name !== item.name))}
                >
                  <Close />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
