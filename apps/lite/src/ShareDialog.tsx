import {useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {copyText} from '../../../src/features/shared/copy';
import {DialogActions} from './ui/DialogActions';
import {useMessages} from './i18n';
export default function ShareDialog({name, link, close}: {name: string; link: string; close: () => void}) {
  const t = useMessages();
  const [status, setStatus] = useState<'copied' | 'failed' | null>(null);
  const [pending, setPending] = useState(false);
  const tooLong = new TextEncoder().encode(link).length > 2000;
  return (
    <Dialog
      isOpen
      width={640}
      maxHeight="85dvh"
      purpose={pending ? 'required' : 'form'}
      onOpenChange={open => {
        if (!open && !pending) close();
      }}
    >
      <Layout
        header={<DialogHeader title={`${t.share} ${name}`} onOpenChange={pending ? undefined : close} />}
        content={
          <LayoutContent className="lite-dialog-content">
            <VStack gap={4}>
              <VStack hAlign="center" padding={3}>
                {tooLong ? (
                  <Text>{t.qrTooLong}</Text>
                ) : (
                  <QRCodeSVG value={link} size={240} marginSize={4} level="M" title={name} style={{maxWidth: '100%', height: 'auto'}} />
                )}
              </VStack>
              <TextArea label={t.shareLink} value={link} rows={4} isReadOnly />
              <Text role="status">{status === 'failed' ? t.copyFailed : status === 'copied' ? t.copied : t.shareHelp}</Text>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <DialogActions
              cancelLabel={t.close}
              onCancel={close}
              confirmLabel={status === 'copied' ? t.copied : t.copyLink}
              isPending={pending}
              isCancelDisabled={pending}
              isConfirmDisabled={pending}
              onConfirm={() => {
                setPending(true);
                void copyText(link)
                  .then(
                    copied => setStatus(copied ? 'copied' : 'failed'),
                    () => setStatus('failed')
                  )
                  .finally(() => setPending(false));
              }}
            />
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
