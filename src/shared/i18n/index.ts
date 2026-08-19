import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/shared/i18n/locales/en-US/translation.json';
import zh from '@/shared/i18n/locales/zh-CN/translation.json';
import { initialLanguage } from '@/shared/lib/prefs';

void i18n.use(initReactI18next).init({
	resources: {
		'zh-CN': { translation: zh },
		'en-US': { translation: en },
	},
	lng: initialLanguage(),
	fallbackLng: 'zh-CN',
	supportedLngs: ['zh-CN', 'en-US'],
	interpolation: { escapeValue: false },
});

export default i18n;
