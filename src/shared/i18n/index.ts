import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from '@/shared/i18n/locales/en-US/translation.json';
import zh from '@/shared/i18n/locales/zh-CN/translation.json';

void i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			'zh-CN': { translation: zh },
			'en-US': { translation: en },
		},
		fallbackLng: 'zh-CN',
		interpolation: { escapeValue: false },
	});

export default i18n;
