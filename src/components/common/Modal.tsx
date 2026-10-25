import { useRef, type ReactElement } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';

interface ModalProps {
  onClose: () => void;
  /** 遮罩的 className。對話框本體放在遮罩裡面，各元件原本「遮罩包著面板」的版面與 CSS 不用改。 */
  overlayClassName: string;
  /** 遮罩淡入淡出 0.2 秒（要配外層的 `AnimatePresence` 才有淡出）。 */
  fade?: boolean;
  /**
   * 鎖住背景捲動（預設開）。燈箱要「一滾就關、頁面照常捲」，Mermaid 全螢幕自己在 paint 前
   * 同步鎖並補捲軸寬度——那兩個關掉這裡的鎖，否則第一下滾輪被吃掉、或捲軸寬度補兩次。
   */
  lockScroll?: boolean;
  /** 對話框本體，必須是單一元素（Radix 的 `asChild` 會把屬性與 ref 合併上去）。 */
  children: ReactElement;
}

/**
 * 公開頁 modal 的無障礙外殼（Radix Dialog）。外觀與動畫留給呼叫端，這裡只補行為：
 * Tab 困在對話框裡、Esc 與點遮罩關閉、關掉後焦點回到開啟它的按鈕、背景對螢幕閱讀器隱藏、
 * 背景不能捲。以前這幾件事各元件各做一部分，焦點陷阱與歸還焦點則是全部都沒有。
 *
 * 呼叫端用 {@link ModalTitle} 標出標題；畫面上沒有標題的（燈箱）就給
 * `<ModalTitle className="sr-only">`。進出場由外層的 `AnimatePresence` 控制：元件掛著就是開著。
 * 點遮罩關閉是 Radix 判斷「按在對話框本體外」，所以遮罩與本體都不用再掛 onClick。
 */
export function Modal({ onClose, overlayClassName, fade = false, lockScroll = true, children }: ModalProps) {
  // Radix 只會把焦點還給 Dialog.Trigger，而這些 modal 都是自己的按鈕開的（沒有 Trigger），
  // 不接手的話關掉後焦點掉回 <body>，鍵盤使用者得從頁首重新 Tab 一遍。
  // onOpenAutoFocus 觸發時焦點還沒移進來，那一刻的 activeElement 就是開啟它的按鈕。
  const openerRef = useRef<HTMLElement | null>(null);
  const overlay = (
    <motion.div
      className={overlayClassName}
      {...(fade && {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.2 },
      })}
    >
      <Dialog.Content
        asChild
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          // preventScroll：開著時頁面可能捲動過了（燈箱就是捲一段才收），focus 預設會把開啟它的按鈕
          // 捲回畫面裡，等於把讀者拉回原處
          openerRef.current?.focus({ preventScroll: true });
        }}
      >
        {children}
      </Dialog.Content>
    </motion.div>
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        {/* 捲動鎖是 Radix 的 Overlay 帶的；不鎖就不包它，遮罩只是普通的 div */}
        {lockScroll ? <Dialog.Overlay asChild>{overlay}</Dialog.Overlay> : overlay}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalTitle = Dialog.Title;
