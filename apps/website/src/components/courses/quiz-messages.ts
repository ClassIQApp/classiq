import type { InterfaceLanguage } from "../../pages/settings/language-preferences";

export interface QuizMessages {
    ariaLabel: string;
    title: string;
    description: string;

    generateTitle: string;
    generateDescription: string;
    scope: string;
    entireCourse: string;
    lectureFallback: string;
    questionCountLabel: string;
    generating: string;
    generateQuiz: string;
    generationFailed: string;

    availableQuizzes: string;
    quizCount: (count: number) => string;
    questionCount: (count: number) => string;
    loadingQuizzes: string;
    quizzesUnavailable: string;
    retry: string;
    noQuizzesYet: string;
    noQuizzesTeacher: string;
    noQuizzesMember: string;

    allQuizzes: string;
    backToQuiz: string;
    startQuiz: string;
    retakeQuiz: string;
    loadingQuiz: string;
    quizUnavailable: string;

    attemptHistory: string;
    loadingAttempts: string;
    attemptsUnavailable: string;
    noAttempts: string;
    reviewAttempt: string;
    attemptScore: (score: number, total: number) => string;

    questionNumber: (position: number, total: number) => string;
    answeredCount: (answered: number, total: number) => string;
    unansweredNotice: (count: number) => string;
    submitQuiz: string;
    submitting: string;
    submitFailed: string;

    loadingReview: string;
    reviewUnavailable: string;
    yourScore: string;
    scoreSummary: (score: number, total: number) => string;
    percentCorrect: (percent: number) => string;
    yourAnswer: string;
    correctAnswer: string;
    notAnswered: string;
    explanation: string;
    outcome: Record<"correct" | "incorrect" | "unanswered", string>;

    sources: string;
    page: (page: number) => string;
    opening: string;
    popupBlocked: string;
    openResourceFailed: string;
}

export const quizMessagesByLanguage: Record<InterfaceLanguage, QuizMessages> = {
    en: {
        ariaLabel: "Quizzes",
        title: "Quizzes",
        description: "Practice with multiple-choice questions written from lecture transcripts and course resources.",

        generateTitle: "Generate a quiz",
        generateDescription: "Create a quiz for the entire course or choose one lecture to focus on.",
        scope: "Quiz scope",
        entireCourse: "Entire course",
        lectureFallback: "Lecture",
        questionCountLabel: "Questions",
        generating: "Generating…",
        generateQuiz: "Generate quiz",
        generationFailed: "Could not generate the quiz.",

        availableQuizzes: "Available quizzes",
        quizCount: (count) => (count === 1 ? "1 quiz" : `${count} quizzes`),
        questionCount: (count) => (count === 1 ? "1 question" : `${count} questions`),
        loadingQuizzes: "Loading quizzes…",
        quizzesUnavailable: "Quizzes are unavailable right now.",
        retry: "Retry",
        noQuizzesYet: "No quizzes yet",
        noQuizzesTeacher: "Generate a quiz from your lecture material and it will appear here.",
        noQuizzesMember: "Your teacher has not created a quiz for this course yet.",

        allQuizzes: "← All quizzes",
        backToQuiz: "← Back to quiz",
        startQuiz: "Start quiz",
        retakeQuiz: "Retake quiz",
        loadingQuiz: "Loading quiz…",
        quizUnavailable: "Could not load this quiz.",

        attemptHistory: "Your attempts",
        loadingAttempts: "Loading your attempts…",
        attemptsUnavailable: "Your attempts are unavailable right now.",
        noAttempts: "You have not taken this quiz yet.",
        reviewAttempt: "Review",
        attemptScore: (score, total) => `${score} of ${total} correct`,

        questionNumber: (position, total) => `Question ${position} of ${total}`,
        answeredCount: (answered, total) => `${answered} of ${total} answered`,
        unansweredNotice: (count) =>
            count === 1
                ? "1 question is unanswered and will be marked as such."
                : `${count} questions are unanswered and will be marked as such.`,
        submitQuiz: "Submit answers",
        submitting: "Submitting…",
        submitFailed: "Could not submit your answers.",

        loadingReview: "Loading your results…",
        reviewUnavailable: "Could not load these results.",
        yourScore: "Your score",
        scoreSummary: (score, total) => `${score} / ${total}`,
        percentCorrect: (percent) => `${percent}% correct`,
        yourAnswer: "Your answer",
        correctAnswer: "Correct answer",
        notAnswered: "You did not answer this question.",
        explanation: "Explanation",
        outcome: { correct: "Correct", incorrect: "Incorrect", unanswered: "Unanswered" },

        sources: "Sources",
        page: (page) => `Page ${page}`,
        opening: "Opening…",
        popupBlocked: "Allow popups and try opening the file again.",
        openResourceFailed: "Could not open this file.",
    },

    es: {
        ariaLabel: "Cuestionarios",
        title: "Cuestionarios",
        description:
            "Practica con preguntas de opción múltiple creadas a partir de las transcripciones de clases y los recursos del curso.",

        generateTitle: "Generar un cuestionario",
        generateDescription: "Crea un cuestionario para todo el curso o elige una clase específica.",
        scope: "Alcance del cuestionario",
        entireCourse: "Curso completo",
        lectureFallback: "Clase",
        questionCountLabel: "Preguntas",
        generating: "Generando…",
        generateQuiz: "Generar cuestionario",
        generationFailed: "No se pudo generar el cuestionario.",

        availableQuizzes: "Cuestionarios disponibles",
        quizCount: (count) => (count === 1 ? "1 cuestionario" : `${count} cuestionarios`),
        questionCount: (count) => (count === 1 ? "1 pregunta" : `${count} preguntas`),
        loadingQuizzes: "Cargando cuestionarios…",
        quizzesUnavailable: "Los cuestionarios no están disponibles en este momento.",
        retry: "Reintentar",
        noQuizzesYet: "Aún no hay cuestionarios",
        noQuizzesTeacher: "Genera un cuestionario a partir del material de tus clases y aparecerá aquí.",
        noQuizzesMember: "Tu docente aún no ha creado un cuestionario para este curso.",

        allQuizzes: "← Todos los cuestionarios",
        backToQuiz: "← Volver al cuestionario",
        startQuiz: "Comenzar cuestionario",
        retakeQuiz: "Repetir cuestionario",
        loadingQuiz: "Cargando cuestionario…",
        quizUnavailable: "No se pudo cargar este cuestionario.",

        attemptHistory: "Tus intentos",
        loadingAttempts: "Cargando tus intentos…",
        attemptsUnavailable: "Tus intentos no están disponibles en este momento.",
        noAttempts: "Aún no has realizado este cuestionario.",
        reviewAttempt: "Revisar",
        attemptScore: (score, total) => `${score} de ${total} correctas`,

        questionNumber: (position, total) => `Pregunta ${position} de ${total}`,
        answeredCount: (answered, total) => `${answered} de ${total} respondidas`,
        unansweredNotice: (count) =>
            count === 1 ? "1 pregunta sin responder se marcará como tal." : `${count} preguntas sin responder se marcarán como tal.`,
        submitQuiz: "Enviar respuestas",
        submitting: "Enviando…",
        submitFailed: "No se pudieron enviar tus respuestas.",

        loadingReview: "Cargando tus resultados…",
        reviewUnavailable: "No se pudieron cargar estos resultados.",
        yourScore: "Tu puntuación",
        scoreSummary: (score, total) => `${score} / ${total}`,
        percentCorrect: (percent) => `${percent}% correcto`,
        yourAnswer: "Tu respuesta",
        correctAnswer: "Respuesta correcta",
        notAnswered: "No respondiste esta pregunta.",
        explanation: "Explicación",
        outcome: { correct: "Correcta", incorrect: "Incorrecta", unanswered: "Sin responder" },

        sources: "Fuentes",
        page: (page) => `Página ${page}`,
        opening: "Abriendo…",
        popupBlocked: "Permite las ventanas emergentes e intenta abrir el archivo nuevamente.",
        openResourceFailed: "No se pudo abrir este archivo.",
    },

    ar: {
        ariaLabel: "الاختبارات",
        title: "الاختبارات",
        description: "تدرّب على أسئلة الاختيار من متعدد المكتوبة من نصوص المحاضرات ومصادر المقرر.",

        generateTitle: "إنشاء اختبار",
        generateDescription: "أنشئ اختباراً للمقرر بالكامل أو اختر محاضرة محددة للتركيز عليها.",
        scope: "نطاق الاختبار",
        entireCourse: "المقرر بالكامل",
        lectureFallback: "محاضرة",
        questionCountLabel: "الأسئلة",
        generating: "جارٍ الإنشاء…",
        generateQuiz: "إنشاء الاختبار",
        generationFailed: "تعذر إنشاء الاختبار.",

        availableQuizzes: "الاختبارات المتاحة",
        quizCount: (count) => `${count} اختبار`,
        questionCount: (count) => `${count} سؤال`,
        loadingQuizzes: "جارٍ تحميل الاختبارات…",
        quizzesUnavailable: "الاختبارات غير متاحة حالياً.",
        retry: "إعادة المحاولة",
        noQuizzesYet: "لا توجد اختبارات بعد",
        noQuizzesTeacher: "أنشئ اختباراً من مواد محاضراتك وسيظهر هنا.",
        noQuizzesMember: "لم ينشئ معلمك اختباراً لهذا المقرر بعد.",

        allQuizzes: "جميع الاختبارات →",
        backToQuiz: "العودة إلى الاختبار →",
        startQuiz: "ابدأ الاختبار",
        retakeQuiz: "أعد الاختبار",
        loadingQuiz: "جارٍ تحميل الاختبار…",
        quizUnavailable: "تعذر تحميل هذا الاختبار.",

        attemptHistory: "محاولاتك",
        loadingAttempts: "جارٍ تحميل محاولاتك…",
        attemptsUnavailable: "محاولاتك غير متاحة حالياً.",
        noAttempts: "لم تجرِ هذا الاختبار بعد.",
        reviewAttempt: "مراجعة",
        attemptScore: (score, total) => `${score} من ${total} صحيحة`,

        questionNumber: (position, total) => `السؤال ${position} من ${total}`,
        answeredCount: (answered, total) => `تمت الإجابة عن ${answered} من ${total}`,
        unansweredNotice: (count) => `${count} أسئلة بلا إجابة وستُسجَّل على هذا النحو.`,
        submitQuiz: "إرسال الإجابات",
        submitting: "جارٍ الإرسال…",
        submitFailed: "تعذر إرسال إجاباتك.",

        loadingReview: "جارٍ تحميل نتائجك…",
        reviewUnavailable: "تعذر تحميل هذه النتائج.",
        yourScore: "درجتك",
        scoreSummary: (score, total) => `${score} / ${total}`,
        percentCorrect: (percent) => `${percent}% صحيحة`,
        yourAnswer: "إجابتك",
        correctAnswer: "الإجابة الصحيحة",
        notAnswered: "لم تجب عن هذا السؤال.",
        explanation: "الشرح",
        outcome: { correct: "صحيحة", incorrect: "خاطئة", unanswered: "بلا إجابة" },

        sources: "المصادر",
        page: (page) => `الصفحة ${page}`,
        opening: "جارٍ الفتح…",
        popupBlocked: "اسمح بالنوافذ المنبثقة ثم حاول فتح الملف مرة أخرى.",
        openResourceFailed: "تعذر فتح هذا الملف.",
    },

    de: {
        ariaLabel: "Quiz",
        title: "Quiz",
        description: "Übe mit Multiple-Choice-Fragen, die aus Vorlesungstranskripten und Kursmaterialien erstellt werden.",

        generateTitle: "Quiz erstellen",
        generateDescription: "Erstelle ein Quiz für den gesamten Kurs oder wähle eine bestimmte Vorlesung aus.",
        scope: "Umfang des Quiz",
        entireCourse: "Gesamter Kurs",
        lectureFallback: "Vorlesung",
        questionCountLabel: "Fragen",
        generating: "Wird erstellt…",
        generateQuiz: "Quiz erstellen",
        generationFailed: "Das Quiz konnte nicht erstellt werden.",

        availableQuizzes: "Verfügbare Quiz",
        quizCount: (count) => (count === 1 ? "1 Quiz" : `${count} Quiz`),
        questionCount: (count) => (count === 1 ? "1 Frage" : `${count} Fragen`),
        loadingQuizzes: "Quiz werden geladen…",
        quizzesUnavailable: "Quiz sind derzeit nicht verfügbar.",
        retry: "Erneut versuchen",
        noQuizzesYet: "Noch keine Quiz",
        noQuizzesTeacher: "Erstelle ein Quiz aus deinen Vorlesungsmaterialien, dann erscheint es hier.",
        noQuizzesMember: "Deine Lehrperson hat für diesen Kurs noch kein Quiz erstellt.",

        allQuizzes: "← Alle Quiz",
        backToQuiz: "← Zurück zum Quiz",
        startQuiz: "Quiz starten",
        retakeQuiz: "Quiz wiederholen",
        loadingQuiz: "Quiz wird geladen…",
        quizUnavailable: "Dieses Quiz konnte nicht geladen werden.",

        attemptHistory: "Deine Versuche",
        loadingAttempts: "Deine Versuche werden geladen…",
        attemptsUnavailable: "Deine Versuche sind derzeit nicht verfügbar.",
        noAttempts: "Du hast dieses Quiz noch nicht bearbeitet.",
        reviewAttempt: "Ansehen",
        attemptScore: (score, total) => `${score} von ${total} richtig`,

        questionNumber: (position, total) => `Frage ${position} von ${total}`,
        answeredCount: (answered, total) => `${answered} von ${total} beantwortet`,
        unansweredNotice: (count) =>
            count === 1 ? "1 Frage ist unbeantwortet und wird so gewertet." : `${count} Fragen sind unbeantwortet und werden so gewertet.`,
        submitQuiz: "Antworten abgeben",
        submitting: "Wird abgegeben…",
        submitFailed: "Deine Antworten konnten nicht abgegeben werden.",

        loadingReview: "Deine Ergebnisse werden geladen…",
        reviewUnavailable: "Diese Ergebnisse konnten nicht geladen werden.",
        yourScore: "Dein Ergebnis",
        scoreSummary: (score, total) => `${score} / ${total}`,
        percentCorrect: (percent) => `${percent} % richtig`,
        yourAnswer: "Deine Antwort",
        correctAnswer: "Richtige Antwort",
        notAnswered: "Du hast diese Frage nicht beantwortet.",
        explanation: "Erklärung",
        outcome: { correct: "Richtig", incorrect: "Falsch", unanswered: "Unbeantwortet" },

        sources: "Quellen",
        page: (page) => `Seite ${page}`,
        opening: "Wird geöffnet…",
        popupBlocked: "Erlaube Pop-ups und versuche erneut, die Datei zu öffnen.",
        openResourceFailed: "Diese Datei konnte nicht geöffnet werden.",
    },

    fr: {
        ariaLabel: "Quiz",
        title: "Quiz",
        description:
            "Entraînez-vous avec des questions à choix multiples créées à partir des transcriptions de cours et des ressources du cours.",

        generateTitle: "Générer un quiz",
        generateDescription: "Créez un quiz pour l’ensemble du cours ou choisissez un cours particulier.",
        scope: "Portée du quiz",
        entireCourse: "Cours entier",
        lectureFallback: "Cours",
        questionCountLabel: "Questions",
        generating: "Génération…",
        generateQuiz: "Générer le quiz",
        generationFailed: "Impossible de générer le quiz.",

        availableQuizzes: "Quiz disponibles",
        quizCount: (count) => (count === 1 ? "1 quiz" : `${count} quiz`),
        questionCount: (count) => (count === 1 ? "1 question" : `${count} questions`),
        loadingQuizzes: "Chargement des quiz…",
        quizzesUnavailable: "Les quiz sont actuellement indisponibles.",
        retry: "Réessayer",
        noQuizzesYet: "Aucun quiz pour le moment",
        noQuizzesTeacher: "Générez un quiz à partir du matériel de vos cours et il apparaîtra ici.",
        noQuizzesMember: "Votre enseignant n’a pas encore créé de quiz pour ce cours.",

        allQuizzes: "← Tous les quiz",
        backToQuiz: "← Retour au quiz",
        startQuiz: "Commencer le quiz",
        retakeQuiz: "Refaire le quiz",
        loadingQuiz: "Chargement du quiz…",
        quizUnavailable: "Impossible de charger ce quiz.",

        attemptHistory: "Vos tentatives",
        loadingAttempts: "Chargement de vos tentatives…",
        attemptsUnavailable: "Vos tentatives sont actuellement indisponibles.",
        noAttempts: "Vous n’avez pas encore passé ce quiz.",
        reviewAttempt: "Consulter",
        attemptScore: (score, total) => `${score} sur ${total} correctes`,

        questionNumber: (position, total) => `Question ${position} sur ${total}`,
        answeredCount: (answered, total) => `${answered} sur ${total} répondues`,
        unansweredNotice: (count) =>
            count === 1 ? "1 question sans réponse sera notée comme telle." : `${count} questions sans réponse seront notées comme telles.`,
        submitQuiz: "Envoyer les réponses",
        submitting: "Envoi…",
        submitFailed: "Impossible d’envoyer vos réponses.",

        loadingReview: "Chargement de vos résultats…",
        reviewUnavailable: "Impossible de charger ces résultats.",
        yourScore: "Votre score",
        scoreSummary: (score, total) => `${score} / ${total}`,
        percentCorrect: (percent) => `${percent} % de bonnes réponses`,
        yourAnswer: "Votre réponse",
        correctAnswer: "Bonne réponse",
        notAnswered: "Vous n’avez pas répondu à cette question.",
        explanation: "Explication",
        outcome: { correct: "Correcte", incorrect: "Incorrecte", unanswered: "Sans réponse" },

        sources: "Sources",
        page: (page) => `Page ${page}`,
        opening: "Ouverture…",
        popupBlocked: "Autorisez les fenêtres contextuelles puis essayez d’ouvrir le fichier à nouveau.",
        openResourceFailed: "Impossible d’ouvrir ce fichier.",
    },
};

export const localeByLanguage: Record<InterfaceLanguage, string> = {
    en: "en-US",
    es: "es-ES",
    ar: "ar",
    de: "de-DE",
    fr: "fr-FR",
};

export function quizErrorText(error: unknown, language: InterfaceLanguage, fallback: string) {
    return language === "en" && error instanceof Error ? error.message : fallback;
}
