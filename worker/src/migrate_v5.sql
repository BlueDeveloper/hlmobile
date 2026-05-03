CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO site_settings (key, value) VALUES ('logo_icon', 'H');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('logo_text', 'hl');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('logo_accent', 'mobile');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('company_name', '주식회사 에치엘그룹');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('company_ceo', '왕산루');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('business_number', '143-86-02556');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('address', '인천광역시 미추홀구 인하로77번길 27 3층');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('commerce_number', '제 2025-인천연수구-1032호');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('footer_desc', '모든 통신사 신청서를 무료로 작성하고 출력하세요. 가입, 해지, 번호이동 양식을 한 곳에서.');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('copyright', '© 2026 hlmobile. All rights reserved.');
