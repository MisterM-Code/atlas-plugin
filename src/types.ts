export interface AtlasSettings {
	// Vault structure
	vaultStructureCreated: boolean;

	// Folder paths (relative to vault root)
	folders: {
		inbox: string;
		daily: string;
		meetings: string;
		projects: string;
		reports: string;
		people: string;
		raid: string;
		incidents: string;
		knowledge: string;
		compliance: string;
		metrics: string;
		studies: string;
		themes: string;
		archive: string;
		atlas: string; // hidden state folder
	};

	// Ollama config
	ollama: {
		baseUrl: string;
		generationModel: string;
		smallModel: string;
		embeddingModel: string;
		rerankerModel: string;
		timeout_ms: number;
	};

	// Coach mode
	coachMode: {
		enabled: boolean;
		separateVaultPath: string;
		encryptionEnabled: boolean;
	};

	// Email automation
	email: {
		enabled: boolean;
		smtpHost: string;
		smtpPort: number;
		smtpSecure: boolean;
		smtpUser: string;
		smtpPasswordEncrypted: string; // encrypted at rest
		fromAddress: string;
		fromName: string;
		defaultRecipientsWeekly: string;
		defaultRecipientsExec: string;
	};

	// Schedules
	schedules: {
		morningBriefingEnabled: boolean;
		morningBriefingTime: string; // "07:00"
		eveningReviewEnabled: boolean;
		eveningReviewTime: string; // "17:00"
		weeklyReportEnabled: boolean;
		weeklyReportDay: number; // 0=Sunday, 5=Friday
		weeklyReportTime: string; // "16:00"
		quietHoursStart: string; // "18:00"
		quietHoursEnd: string; // "07:00"
	};

	// Notifications
	notifications: {
		desktopEnabled: boolean;
		telegramEnabled: boolean;
		telegramBotToken: string;
		telegramChatId: string;
		ttsEnabled: boolean;
		ttsBinaryPath: string; // piper path
		minimumSeverity: "low" | "medium" | "high" | "critical";
		batchModeEnabled: boolean;
		batchTime: string; // "14:00"
	};

	// Voice / ASR
	voice: {
		enabled: boolean;
		whisperBinaryPath: string;
		whisperModelPath: string;
		language: string; // "pt"
	};

	// Privacy
	privacy: {
		encryptCoachVault: boolean;
		auditLogEnabled: boolean;
		piiRedactionEnabled: boolean;
	};

	// User profile
	user: {
		displayName: string;
		role: string;
		teamName: string;
	};

	// Behavior
	behavior: {
		autoIndexOnStartup: boolean;
		autoExtractKgOnSave: boolean;
		autoCreateBriefingBeforeMeeting: boolean;
		minutesBeforeMeetingNotification: number;
	};

	// First-run onboarding state
	onboarding: {
		completed: boolean;
		currentStep: number;
		ollamaDetected: boolean;
		modelsDownloaded: boolean;
		ramProfile: "light" | "balanced" | "power" | "unknown";
		splashSeen?: boolean; // first-run splash 5s anim
		jarvisTutorialSeen?: boolean; // v0.9.2: Jarvis interactive tutorial first-time
	};

	// Atlas v0.7 Sprint 12 — Animation preferences
	animations?: {
		enabled: boolean; // master toggle (default true)
		soundEffects: boolean; // ding/whoosh sound (default false)
		typingEffect: boolean; // typewriter no chat (default true)
		confetti: boolean; // achievement burst (default true)
	};

	// Performance tuning
	performance: {
		rerankerEnabled: boolean;
		rerankerLoadOnDemand: boolean; // unload after each query
		modelEvictionAggressive: boolean;
		reasoningModeAvailable: boolean; // exposed if RAM allows
		visionOptInAvailable: boolean;
	};

	// Atlas v0.4 Sprint 4 — Auto-organize rules
	rules?: import("./automation/rule-engine").AtlasRule[];

	// Atlas v0.7 Sprint 14+18 — Profile-driven adaptation
	profile?: {
		ids: import("./profiles/registry").ProfileId[]; // multi-select
		colorAccent?: string; // override do default do perfil
		showAllToolsOverride?: boolean; // mostrar tools mesmo de perfis não selecionados
		// optional integration URL per profile (calendar, etc)
		calendarUrl?: string; // iCal URL
	};
}

export const DEFAULT_SETTINGS: AtlasSettings = {
	vaultStructureCreated: false,
	folders: {
		inbox: "01_Inbox",
		daily: "02_Daily",
		meetings: "03_Meetings",
		projects: "04_Projects",
		reports: "05_Reports",
		people: "06_People",
		raid: "07_RAID",
		incidents: "08_Incidents",
		knowledge: "09_Knowledge",
		compliance: "10_Compliance",
		metrics: "11_Metrics",
		studies: "12_Studies",
		themes: "13_Themes",
		archive: "99_Archive",
		atlas: ".atlas",
	},
	ollama: {
		baseUrl: "http://localhost:11434",
		// Defaults conservadores: cabe em ~3 GB RAM livres. Onboarding faz upgrade quando detecta mais.
		generationModel: "llama3.2:3b",
		smallModel: "llama3.2:3b",
		embeddingModel: "bge-m3",
		rerankerModel: "bge-reranker-v2-m3",
		timeout_ms: 180000,
	},
	coachMode: {
		enabled: false,
		separateVaultPath: "",
		encryptionEnabled: true,
	},
	email: {
		enabled: false,
		smtpHost: "smtp.gmail.com",
		smtpPort: 465,
		smtpSecure: true,
		smtpUser: "",
		smtpPasswordEncrypted: "",
		fromAddress: "",
		fromName: "",
		defaultRecipientsWeekly: "",
		defaultRecipientsExec: "",
	},
	schedules: {
		morningBriefingEnabled: true,
		morningBriefingTime: "07:00",
		eveningReviewEnabled: true,
		eveningReviewTime: "17:00",
		weeklyReportEnabled: true,
		weeklyReportDay: 5, // Friday
		weeklyReportTime: "16:00",
		quietHoursStart: "18:00",
		quietHoursEnd: "07:00",
	},
	notifications: {
		desktopEnabled: true,
		telegramEnabled: false,
		telegramBotToken: "",
		telegramChatId: "",
		ttsEnabled: false,
		ttsBinaryPath: "",
		minimumSeverity: "low",
		batchModeEnabled: true,
		batchTime: "14:00",
	},
	voice: {
		enabled: false,
		whisperBinaryPath: "",
		whisperModelPath: "",
		language: "pt",
	},
	privacy: {
		encryptCoachVault: true,
		auditLogEnabled: true,
		piiRedactionEnabled: true,
	},
	user: {
		displayName: "",
		role: "",
		teamName: "",
	},
	behavior: {
		autoIndexOnStartup: true,
		autoExtractKgOnSave: true,
		autoCreateBriefingBeforeMeeting: true,
		minutesBeforeMeetingNotification: 15,
	},
	onboarding: {
		completed: false,
		currentStep: 0,
		ollamaDetected: false,
		modelsDownloaded: false,
		ramProfile: "unknown",
	},
	performance: {
		rerankerEnabled: true,
		rerankerLoadOnDemand: true,
		modelEvictionAggressive: true,
		reasoningModeAvailable: false, // toggled on by onboarding RAM detection
		visionOptInAvailable: false,
	},
};
