// 設備清單的資料。產品名與規格是原文（型號不翻譯），用途說明走翻譯檔的 setup.roles.*。
//
// ⚠ 新增產品圖：先轉成 WebP、長邊 640px、裁掉透明邊再放進 src/assets/setup/。
//   卡片最寬約 220px，640 已經夠高 DPI 螢幕用；原本直接放 PNG 時整個資料夾 16.5MB，
//   轉完是 1MB。（sharp 已在相依裡：trim → resize 640 inside → webp quality 82）
import img4070ti from '@/assets/setup/4070ti-super.webp';
import img5060ti from '@/assets/setup/5060ti-16g.webp';
import img9900x from '@/assets/setup/9900X.webp';
import imgRyzen8700g from '@/assets/setup/ryzen-7-8700g.webp';
import imgB650a from '@/assets/setup/b650-a.webp';
import imgTomahawk from '@/assets/setup/tomahawk-x870e-wifi.webp';
import imgDdr5_6000 from '@/assets/setup/ddr5-6000.webp';
import imgKingstonDdr5 from '@/assets/setup/kinston-ddr5-5600.webp';
import imgModel5 from '@/assets/setup/Geometric-Future-Model5.webp';
import imgEskimo from '@/assets/setup/Geometric-Future-Eskimo.webp';
import imgLeadexVii from '@/assets/setup/Leadex-VII-PRO-850W.webp';
import imgPrimeTx from '@/assets/setup/PRIME-TX-1600-1300-PX-1600-back-panel-angled-scaled.webp';
import imgCrucialT500 from '@/assets/setup/Crucial-SSD-T500.webp';
import imgKioxia from '@/assets/setup/KIOXIA-Exceria-Pro.webp';
import imgAcerSsd from '@/assets/setup/acer-ssd.webp';
import imgWd16tb from '@/assets/setup/wd-16tb.webp';
import imgXg27acs from '@/assets/setup/XG27ACS.webp';
import imgP10c from '@/assets/setup/p10c.webp';
import imgThermalright from '@/assets/setup/Thermalright.webp';
import imgBd5 from '@/assets/setup/asus-bd5.webp';
import imgQgU1050 from '@/assets/setup/QG-U1050.webp';
import imgPixel8 from '@/assets/setup/pixel8.webp';
import imgRazerBlade from '@/assets/setup/razer-blade-14.webp';
import imgG502x from '@/assets/setup/g502-x-lightspeed.webp';
import imgG502Hero from '@/assets/setup/g502-hero.webp';
import imgCherry31s from '@/assets/setup/cherry-3.1s.webp';
import imgCherry20s from '@/assets/setup/Cherry-2.0s-mx2a.webp';
import imgHyperxFps from '@/assets/setup/HyperX-Alloy-FPS.webp';
import imgPuddingKeycaps from '@/assets/setup/HyperX-Pudding-Keycaps.webp';
import imgPixelBuds from '@/assets/setup/Pixel-buds-pro2.webp';
import imgCloudII from '@/assets/setup/Cloud-II-Wireless.webp';
import imgQuadcast from '@/assets/setup/hyperx-quadcast.webp';
import imgShureMv7Plus from '@/assets/setup/shure-mv7-plus.webp';
import imgPsa1Plus from '@/assets/setup/PSA1-plus.webp';
import imgArctisNova7Gen2 from '@/assets/setup/arctis-nova-7-wireless-gen-2-white.webp';
import imgT100 from '@/assets/setup/t100.webp';
import imgNanoKvm from '@/assets/setup/nanokvm-pcie.webp';
import imgGoogleTv from '@/assets/setup/google-tv-streamer.webp';
import imgHub3 from '@/assets/setup/switchbot-hub3.webp';
import imgRm4 from '@/assets/setup/broadlink-rm4pro.webp';
import imgEsp32Cc1101 from '@/assets/setup/esp32-cc1101.webp';
import imgTapoD230s1 from '@/assets/setup/tapo-d230s1.webp';

type CategoryId = 'main-rig' | 'server' | 'network' | 'smart-home' | 'peripherals';

/** 頁面的分類篩選；終端機的 cd 也是改這個 */
export type GearFilter = 'all' | CategoryId | 'base-ii';

export interface GearItem {
  /** 卡片的錨點（#gear-<id>），拓撲圖的節點靠它捲過來 */
  id: string;
  name: string;
  spec: string;
  image?: string;
  /** setup.roles.<roleKey>：一句話用途，只有「為什麼有它」不明顯的才寫 */
  roleKey?: string;
}

export interface GearCategory {
  id: CategoryId;
  /** 分類的英文名，跟書櫃、音樂頁的英文小標同一套語氣 */
  name: string;
  items: GearItem[];
}

export const GEAR: GearCategory[] = [
  {
    id: 'main-rig',
    name: 'The White Build',
    items: [
      { id: 'rtx-4070ti-super', name: 'MSI RTX 4070 Ti Super', spec: 'Gaming X Slim White 16G', image: img4070ti },
      { id: 'ryzen-9900x', name: 'AMD Ryzen 9 9900X', spec: '12-Core, 24-Thread Processor', image: img9900x },
      { id: 'b650-a', name: 'ROG Strix B650-A', spec: 'Gaming WiFi Motherboard', image: imgB650a },
      { id: 'xpg-lancer', name: 'XPG Lancer Blade RGB', spec: '64GB (16GBx4) DDR5-6000 White', image: imgDdr5_6000 },
      { id: 'model-5', name: 'Geometric Future Model 5', spec: 'Wukong Edition (White)', image: imgModel5 },
      { id: 'eskimo-360', name: 'Eskimo Pro 360', spec: '360mm AIO Liquid Cooler', image: imgEskimo },
      { id: 'leadex-vii', name: 'Super Flower Leadex VII', spec: '850W Platinum ATX 3.1', image: imgLeadexVii },
      { id: 'crucial-t500', name: 'Crucial T500 SSD', spec: '1TB Gen4 NVMe (System)', image: imgCrucialT500 },
      { id: 'kioxia-exceria', name: 'KIOXIA Exceria Pro', spec: '2TB Gen4 NVMe (Games)', image: imgKioxia },
      { id: 'xg27acs', name: 'ROG Strix XG27ACS', spec: '27" 1440p Gaming Monitor', image: imgXg27acs },
    ],
  },
  {
    id: 'server',
    name: 'Home Server',
    items: [
      { id: 'rtx-5060ti', name: 'MSI RTX 5060 Ti', spec: 'Ventus 2X Plus 16G', image: img5060ti },
      { id: 'ryzen-8700g', name: 'AMD Ryzen 7 8700G', spec: '8-Core Processor with AI', image: imgRyzen8700g },
      { id: 'x870e-tomahawk', name: 'MSI MAG X870E Tomahawk', spec: 'WiFi Motherboard', image: imgTomahawk },
      { id: 'fury-beast', name: 'Kingston FURY Beast', spec: '64GB (32GBx2) DDR5-5600', image: imgKingstonDdr5 },
      { id: 'phantom-spirit', name: 'Thermalright Phantom Spirit', spec: '120 EVO Cooler', image: imgThermalright },
      { id: 'prime-tx', name: 'Seasonic PRIME TX-750', spec: '750W Titanium PSU', image: imgPrimeTx },
      { id: 'p10c', name: 'Antec P10C', spec: 'Silent Mid-Tower Case', image: imgP10c },
      { id: 'gm7000', name: 'Predator GM7000', spec: '2TB Gen4 NVMe SSD', image: imgAcerSsd },
      { id: 'hc550', name: 'WD Ultrastar HC550', spec: '32TB (16TBx2) HDD Pool', image: imgWd16tb },
      { id: 'nanokvm-pcie', name: 'Sipeed NanoKVM PCIe', spec: 'IP-KVM Card', image: imgNanoKvm, roleKey: 'nanokvm' },
      { id: 'headless-adaptor', name: 'Headless Adaptor', spec: 'DisplayPort Dummy Plug', roleKey: 'headless' },
    ],
  },
  {
    id: 'network',
    name: 'Network & Mobile',
    items: [
      { id: 'zenwifi-bd5', name: 'ASUS ZenWiFi BD5', spec: 'WiFi 7 BE5000 Mesh System', image: imgBd5 },
      { id: 'qg-u1050', name: 'ASUS QG-U1050', spec: '5-Port Switch', image: imgQgU1050 },
      { id: 'pixel-8-pro', name: 'Google Pixel 8 Pro', spec: '256GB / Bay Blue', image: imgPixel8 },
      { id: 'blade-14', name: 'Razer Blade 14 (2021)', spec: 'Ryzen 5900HX / RTX 3070', image: imgRazerBlade },
    ],
  },
  {
    id: 'smart-home',
    name: 'Smart Home',
    items: [
      {
        id: 'google-tv-streamer',
        name: 'Google TV Streamer',
        spec: '4K · Matter / Thread Hub',
        image: imgGoogleTv,
        roleKey: 'googleTv',
      },
      {
        id: 'switchbot-hub3',
        name: 'SwitchBot Hub 3',
        spec: 'Matter Bridge · Sensors',
        image: imgHub3,
        roleKey: 'hub3',
      },
      { id: 'rm4-pro', name: 'BroadLink RM4 Pro', spec: 'IR / RF Universal Remote', image: imgRm4, roleKey: 'rm4' },
      {
        id: 'esp32-cc1101',
        name: 'ESP32-C3 SuperMini + CC1101',
        spec: 'DIY 433MHz RF Transmitter',
        image: imgEsp32Cc1101,
        roleKey: 'esp32',
      },
      {
        id: 'tapo-d230s1',
        name: 'Tapo D230S1',
        spec: 'Battery Video Doorbell + H200 Hub',
        image: imgTapoD230s1,
        roleKey: 'doorbell',
      },
    ],
  },
  {
    id: 'peripherals',
    name: 'Peripherals',
    items: [
      { id: 'g502-x', name: 'Logitech G502 X', spec: 'Lightspeed Wireless', image: imgG502x },
      { id: 'g502-hero', name: 'Logitech G502 Hero', spec: 'Wired Gaming Mouse', image: imgG502Hero },
      { id: 'mx-board-31s', name: 'Cherry MX Board 3.1S', spec: 'MX2A RGB (Silent Red)', image: imgCherry31s },
      { id: 'mx-board-20s', name: 'Cherry MX Board 2.0S', spec: 'Wireless / Silent Red', image: imgCherry20s },
      { id: 'mk882', name: 'Fantech Pantheon MK882', spec: 'w/ HyperX Pudding Keycaps', image: imgPuddingKeycaps },
      { id: 'alloy-fps', name: 'HyperX Alloy FPS', spec: 'Blue Switch', image: imgHyperxFps },
      { id: 'pixel-buds-pro2', name: 'Pixel Buds Pro 2', spec: 'Wireless Earbuds', image: imgPixelBuds },
      { id: 'cloud-ii', name: 'HyperX Cloud II', spec: 'Wireless Headset', image: imgCloudII },
      {
        id: 'arctis-nova-7',
        name: 'Arctis Nova 7 Wireless Gen 2',
        spec: 'White Edition Headset',
        image: imgArctisNova7Gen2,
      },
      { id: 'quadcast', name: 'HyperX QuadCast', spec: 'USB Microphone', image: imgQuadcast },
      { id: 'mv7-plus', name: 'Shure MV7+', spec: 'USB/XLR Podcast Microphone', image: imgShureMv7Plus },
      { id: 'psa1-plus', name: 'RODE PSA1+', spec: 'Professional Studio Boom Arm', image: imgPsa1Plus },
      { id: 't100', name: 'Creative T100', spec: 'Hi-Fi 2.0 Speakers', image: imgT100 },
    ],
  },
];

/** 老家那台：零件拼起來的備用機，只列規格不放圖 */
export const BASE_II_SPECS: { label: string; value: string }[] = [
  { label: 'GPU', value: 'NVIDIA RTX 2060 Super 8GB' },
  { label: 'CPU', value: 'Intel Core i5-9400F' },
  { label: 'RAM', value: '24GB DDR4 Mixed (Corsair RGB + Kingston)' },
  { label: 'MB', value: 'Intel B360M Chipset' },
  { label: 'PSU', value: 'Super Flower Leadex III 650W Gold ARGB' },
  { label: 'Storage', value: 'Micron SATA SSD + Toshiba 1TB HDD' },
  { label: 'Case', value: 'Legacy Mid-Tower (Recycled)' },
];

/**
 * 其他連網家電：智慧家庭的一部分，但不是「挑過的設備」，所以只列名字與類型、不放產品圖。
 * 類型走 setup.appliances.types.*。
 */
export const APPLIANCES: { name: string; typeKey: string }[] = [
  { name: 'LG', typeKey: 'dehumidifier' },
  { name: 'Electrolux', typeKey: 'airPurifier' },
  { name: 'LG AeroCatTower', typeKey: 'catTower' },
  { name: 'Furspark', typeKey: 'feeder' },
  { name: 'Tapo C210', typeKey: 'camera' },
  { name: 'SwitchBot Plug Mini', typeKey: 'plug' },
];
