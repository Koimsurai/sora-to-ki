// 設備清單的資料。產品名與規格是原文（型號不翻譯），用途說明走翻譯檔的 setup.roles.*。
// 圖紙上畫在哪裡在 setupSheets；零件線稿是 public/illustrations/setup/<id>.webp（暖白透明底）。

type CategoryId = 'main-rig' | 'server' | 'network' | 'smart-home' | 'peripherals';

export interface GearItem {
  /** 也是零件線稿的檔名 */
  id: string;
  name: string;
  spec: string;
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
      { id: 'rtx-4070ti-super', name: 'MSI RTX 4070 Ti Super', spec: 'Gaming X Slim White 16G' },
      { id: 'ryzen-9900x', name: 'AMD Ryzen 9 9900X', spec: '12-Core, 24-Thread Processor' },
      { id: 'b650-a', name: 'ROG Strix B650-A', spec: 'Gaming WiFi Motherboard' },
      { id: 'xpg-lancer', name: 'XPG Lancer Blade RGB', spec: '64GB (16GBx4) DDR5-6000 White' },
      { id: 'model-5', name: 'Geometric Future Model 5', spec: 'Wukong Edition (White)' },
      { id: 'eskimo-360', name: 'Eskimo Pro 360', spec: '360mm AIO Liquid Cooler' },
      { id: 'leadex-vii', name: 'Super Flower Leadex VII', spec: '850W Platinum ATX 3.1' },
      { id: 'crucial-t500', name: 'Crucial T500 SSD', spec: '1TB Gen4 NVMe (System)' },
      { id: 'kioxia-exceria', name: 'KIOXIA Exceria Pro', spec: '2TB Gen4 NVMe (Games)' },
      { id: 'xg27acs', name: 'ROG Strix XG27ACS', spec: '27" 1440p Gaming Monitor' },
    ],
  },
  {
    id: 'server',
    name: 'Home Server',
    items: [
      { id: 'rtx-5060ti', name: 'MSI RTX 5060 Ti', spec: 'Ventus 2X Plus 16G' },
      { id: 'ryzen-8700g', name: 'AMD Ryzen 7 8700G', spec: '8-Core Processor with AI' },
      { id: 'x870e-tomahawk', name: 'MSI MAG X870E Tomahawk', spec: 'WiFi Motherboard' },
      { id: 'fury-beast', name: 'Kingston FURY Beast', spec: '64GB (32GBx2) DDR5-5600' },
      { id: 'phantom-spirit', name: 'Thermalright Phantom Spirit', spec: '120 EVO Cooler' },
      { id: 'prime-tx', name: 'Seasonic PRIME TX-750', spec: '750W Titanium PSU' },
      { id: 'p10c', name: 'Antec P10C', spec: 'Silent Mid-Tower Case' },
      { id: 'gm7000', name: 'Predator GM7000', spec: '2TB Gen4 NVMe SSD' },
      { id: 'hc550', name: 'WD Ultrastar HC550', spec: '32TB (16TBx2) HDD Pool' },
      { id: 'nanokvm-pcie', name: 'Sipeed NanoKVM PCIe', spec: 'IP-KVM Card', roleKey: 'nanokvm' },
      { id: 'headless-adaptor', name: 'Headless Adaptor', spec: 'DisplayPort Dummy Plug', roleKey: 'headless' },
    ],
  },
  {
    id: 'network',
    name: 'Network & Mobile',
    items: [
      { id: 'zenwifi-bd5', name: 'ASUS ZenWiFi BD5', spec: 'WiFi 7 BE5000 Mesh System' },
      { id: 'qg-u1050', name: 'ASUS QG-U1050', spec: '5-Port Switch' },
      { id: 'pixel-8-pro', name: 'Google Pixel 8 Pro', spec: '256GB / Bay Blue' },
      { id: 'blade-14', name: 'Razer Blade 14 (2021)', spec: 'Ryzen 5900HX / RTX 3070' },
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
        roleKey: 'googleTv',
      },
      {
        id: 'switchbot-hub3',
        name: 'SwitchBot Hub 3',
        spec: 'Matter Bridge · Sensors',
        roleKey: 'hub3',
      },
      { id: 'rm4-pro', name: 'BroadLink RM4 Pro', spec: 'IR / RF Universal Remote', roleKey: 'rm4' },
      {
        id: 'esp32-cc1101',
        name: 'ESP32-C3 SuperMini + CC1101',
        spec: 'DIY 433MHz RF Transmitter',
        roleKey: 'esp32',
      },
      {
        id: 'tapo-d230s1',
        name: 'Tapo D230S1',
        spec: 'Battery Video Doorbell + H200 Hub',
        roleKey: 'doorbell',
      },
    ],
  },
  {
    id: 'peripherals',
    name: 'Peripherals',
    items: [
      { id: 'g502-x', name: 'Logitech G502 X', spec: 'Lightspeed Wireless' },
      { id: 'g502-hero', name: 'Logitech G502 Hero', spec: 'Wired Gaming Mouse' },
      { id: 'mx-board-31s', name: 'Cherry MX Board 3.1S', spec: 'MX2A RGB (Silent Red)' },
      { id: 'mx-board-20s', name: 'Cherry MX Board 2.0S', spec: 'Wireless / Silent Red' },
      { id: 'mk882', name: 'Fantech Pantheon MK882', spec: 'w/ HyperX Pudding Keycaps' },
      { id: 'alloy-fps', name: 'HyperX Alloy FPS', spec: 'Blue Switch' },
      { id: 'pixel-buds-pro2', name: 'Pixel Buds Pro 2', spec: 'Wireless Earbuds' },
      { id: 'cloud-ii', name: 'HyperX Cloud II', spec: 'Wireless Headset' },
      {
        id: 'arctis-nova-7',
        name: 'Arctis Nova 7 Wireless Gen 2',
        spec: 'White Edition Headset',
      },
      { id: 'quadcast', name: 'HyperX QuadCast', spec: 'USB Microphone' },
      { id: 'mv7-plus', name: 'Shure MV7+', spec: 'USB/XLR Podcast Microphone' },
      { id: 'psa1-plus', name: 'RODE PSA1+', spec: 'Professional Studio Boom Arm' },
      { id: 't100', name: 'Creative T100', spec: 'Hi-Fi 2.0 Speakers' },
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
