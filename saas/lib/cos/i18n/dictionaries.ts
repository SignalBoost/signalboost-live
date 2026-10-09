// saas/lib/cos/i18n/dictionaries.ts
// Bundled COS i18n dictionaries — the PORTABLE source of truth for the module's eleven
// languages (en/es/pt/pl/ru/de/fr/it/ja/ko/ar). Bundling here (instead of importing /locales/*.json) keeps
// the module self-contained: the whole lib/cos folder moves to another project as a unit
// with no external file dependency. Structure is identical across languages (enforced by
// scripts/verify-cos-locale-parity.mjs against the standalone /locales/cos.*.json copies).

export type CosLang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
export const COS_LANGS: CosLang[] = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']

const en: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "Mining",
      "features": "Features",
      "segments": "Segments",
      "rules": "Patterns",
      "runs": "Run History"
    },
    "mining": {
      "title": "Data Mining",
      "subtitle": "Behavioral and transactional patterns powering predictions",
      "run_now": "Run now",
      "last_run": "Last run",
      "events_scanned": "Events scanned",
      "users_processed": "Users processed",
      "features_written": "Features written",
      "rules_found": "Patterns found"
    },
    "features": {
      "title": "Mined Features",
      "name": "Feature",
      "value": "Value",
      "updated": "Updated",
      "names": {
        "event_frequency_per_day": "Activity per day",
        "transaction_count": "Transactions",
        "avg_deposit_cents": "Average deposit",
        "avg_transfer_cents": "Average transfer",
        "preferred_txn_hour": "Preferred hour",
        "dominant_device_code": "Main device",
        "campaign_engagement_rate": "Campaign engagement",
        "recency_days": "Days since last activity",
        "amount_trend_slope": "Spending trend"
      }
    },
    "segments": {
      "title": "Behavior Segments",
      "cluster": "Cluster",
      "members": "Members"
    },
    "rules": {
      "title": "Detected Patterns",
      "if": "If",
      "then": "then",
      "support": "Support",
      "confidence": "Confidence",
      "lift": "Lift"
    },
    "status": {
      "running": "Running",
      "success": "Success",
      "error": "Error"
    },
    "empty": {
      "no_features": "No features yet — run a mining job to populate them.",
      "no_rules": "No patterns detected yet.",
      "no_runs": "No mining runs recorded yet."
    },
    "errors": {
      "unauthorized": "Please sign in to continue.",
      "forbidden": "You don't have access to this data.",
      "load_failed": "Could not load data. Please try again."
    },
    "tooltips": {
      "confidence": "How often the pattern holds when the condition is met.",
      "lift": "How much more likely the result is versus chance.",
      "segment": "Group of users with similar behavior."
    },
    "meta": {
      "title": "COS Data Mining — SignalBoost",
      "description": "Mined behavioral and transactional signals that power COS predictions."
    },
    "dashboard": {
      "overview": "Overview",
      "refresh": "Refresh",
      "run_history": "Run history",
      "segment_distribution": "Segment distribution",
      "top_patterns": "Top patterns",
      "no_access": "Admin access required to view mining intelligence.",
      "lookup_user": "User feature lookup",
      "user_id_placeholder": "Enter user ID",
      "view": "View",
      "never": "Never",
      "users": "users"
    },
    "predict": {
      "title": "Predicted next actions",
      "action": "Action",
      "score": "Score",
      "basis": "Why",
      "none": "Not enough signal to predict yet.",
      "propensity": "Propensity",
      "engagement": "Engagement",
      "churn_risk": "Churn risk",
      "value": "Value"
    }
  }
}

const es: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "Minería",
      "features": "Características",
      "segments": "Segmentos",
      "rules": "Patrones",
      "runs": "Historial"
    },
    "mining": {
      "title": "Minería de datos",
      "subtitle": "Patrones de comportamiento y transacciones que impulsan las predicciones",
      "run_now": "Ejecutar ahora",
      "last_run": "Última ejecución",
      "events_scanned": "Eventos analizados",
      "users_processed": "Usuarios procesados",
      "features_written": "Características generadas",
      "rules_found": "Patrones encontrados"
    },
    "features": {
      "title": "Características extraídas",
      "name": "Característica",
      "value": "Valor",
      "updated": "Actualizado",
      "names": {
        "event_frequency_per_day": "Actividad por día",
        "transaction_count": "Transacciones",
        "avg_deposit_cents": "Depósito promedio",
        "avg_transfer_cents": "Transferencia promedio",
        "preferred_txn_hour": "Hora preferida",
        "dominant_device_code": "Dispositivo principal",
        "campaign_engagement_rate": "Interacción con campañas",
        "recency_days": "Días desde la última actividad",
        "amount_trend_slope": "Tendencia de gasto"
      }
    },
    "segments": {
      "title": "Segmentos de comportamiento",
      "cluster": "Grupo",
      "members": "Miembros"
    },
    "rules": {
      "title": "Patrones detectados",
      "if": "Si",
      "then": "entonces",
      "support": "Soporte",
      "confidence": "Confianza",
      "lift": "Lift"
    },
    "status": {
      "running": "En ejecución",
      "success": "Correcto",
      "error": "Error"
    },
    "empty": {
      "no_features": "Aún no hay características; ejecuta una minería para generarlas.",
      "no_rules": "Aún no se detectaron patrones.",
      "no_runs": "Aún no hay ejecuciones registradas."
    },
    "errors": {
      "unauthorized": "Inicia sesión para continuar.",
      "forbidden": "No tienes acceso a estos datos.",
      "load_failed": "No se pudieron cargar los datos. Inténtalo de nuevo."
    },
    "tooltips": {
      "confidence": "Con qué frecuencia se cumple el patrón cuando se da la condición.",
      "lift": "Cuánto más probable es el resultado frente al azar.",
      "segment": "Grupo de usuarios con comportamiento similar."
    },
    "meta": {
      "title": "Minería de datos COS — SignalBoost",
      "description": "Señales de comportamiento y transacciones que impulsan las predicciones de COS."
    },
    "dashboard": {
      "overview": "Resumen",
      "refresh": "Actualizar",
      "run_history": "Historial de ejecuciones",
      "segment_distribution": "Distribución de segmentos",
      "top_patterns": "Principales patrones",
      "no_access": "Se requiere acceso de administrador para ver la inteligencia de minería.",
      "lookup_user": "Búsqueda de características de usuario",
      "user_id_placeholder": "Ingresa el ID de usuario",
      "view": "Ver",
      "never": "Nunca",
      "users": "usuarios"
    },
    "predict": {
      "title": "Próximas acciones previstas",
      "action": "Acción",
      "score": "Puntuación",
      "basis": "Motivo",
      "none": "Aún no hay señal suficiente para predecir.",
      "propensity": "Propensión",
      "engagement": "Interacción",
      "churn_risk": "Riesgo de abandono",
      "value": "Valor"
    }
  }
}

const pt: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "Mineração",
      "features": "Atributos",
      "segments": "Segmentos",
      "rules": "Padrões",
      "runs": "Histórico"
    },
    "mining": {
      "title": "Mineração de dados",
      "subtitle": "Padrões de comportamento e transações que alimentam as previsões",
      "run_now": "Executar agora",
      "last_run": "Última execução",
      "events_scanned": "Eventos analisados",
      "users_processed": "Usuários processados",
      "features_written": "Atributos gerados",
      "rules_found": "Padrões encontrados"
    },
    "features": {
      "title": "Atributos extraídos",
      "name": "Atributo",
      "value": "Valor",
      "updated": "Atualizado",
      "names": {
        "event_frequency_per_day": "Atividade por dia",
        "transaction_count": "Transações",
        "avg_deposit_cents": "Depósito médio",
        "avg_transfer_cents": "Transferência média",
        "preferred_txn_hour": "Horário preferido",
        "dominant_device_code": "Dispositivo principal",
        "campaign_engagement_rate": "Engajamento em campanhas",
        "recency_days": "Dias desde a última atividade",
        "amount_trend_slope": "Tendência de gastos"
      }
    },
    "segments": {
      "title": "Segmentos de comportamento",
      "cluster": "Grupo",
      "members": "Membros"
    },
    "rules": {
      "title": "Padrões detectados",
      "if": "Se",
      "then": "então",
      "support": "Suporte",
      "confidence": "Confiança",
      "lift": "Lift"
    },
    "status": {
      "running": "Em execução",
      "success": "Concluído",
      "error": "Erro"
    },
    "empty": {
      "no_features": "Ainda não há atributos; execute uma mineração para gerá-los.",
      "no_rules": "Nenhum padrão detectado ainda.",
      "no_runs": "Nenhuma execução registrada ainda."
    },
    "errors": {
      "unauthorized": "Faça login para continuar.",
      "forbidden": "Você não tem acesso a estes dados.",
      "load_failed": "Não foi possível carregar os dados. Tente novamente."
    },
    "tooltips": {
      "confidence": "Com que frequência o padrão se confirma quando a condição ocorre.",
      "lift": "Quanto mais provável é o resultado em relação ao acaso.",
      "segment": "Grupo de usuários com comportamento semelhante."
    },
    "meta": {
      "title": "Mineração de dados COS — SignalBoost",
      "description": "Sinais de comportamento e transações que alimentam as previsões do COS."
    },
    "dashboard": {
      "overview": "Visão geral",
      "refresh": "Atualizar",
      "run_history": "Histórico de execuções",
      "segment_distribution": "Distribuição de segmentos",
      "top_patterns": "Principais padrões",
      "no_access": "É necessário acesso de administrador para ver a inteligência de mineração.",
      "lookup_user": "Busca de atributos do usuário",
      "user_id_placeholder": "Informe o ID do usuário",
      "view": "Ver",
      "never": "Nunca",
      "users": "usuários"
    },
    "predict": {
      "title": "Próximas ações previstas",
      "action": "Ação",
      "score": "Pontuação",
      "basis": "Motivo",
      "none": "Ainda não há sinal suficiente para prever.",
      "propensity": "Propensão",
      "engagement": "Engajamento",
      "churn_risk": "Risco de abandono",
      "value": "Valor"
    }
  }
}

const pl: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "Eksploracja",
      "features": "Cechy",
      "segments": "Segmenty",
      "rules": "Wzorce",
      "runs": "Historia"
    },
    "mining": {
      "title": "Eksploracja danych",
      "subtitle": "Wzorce zachowań i transakcji zasilające prognozy",
      "run_now": "Uruchom teraz",
      "last_run": "Ostatnie uruchomienie",
      "events_scanned": "Przeanalizowane zdarzenia",
      "users_processed": "Przetworzeni użytkownicy",
      "features_written": "Wygenerowane cechy",
      "rules_found": "Znalezione wzorce"
    },
    "features": {
      "title": "Wyodrębnione cechy",
      "name": "Cecha",
      "value": "Wartość",
      "updated": "Zaktualizowano",
      "names": {
        "event_frequency_per_day": "Aktywność dziennie",
        "transaction_count": "Transakcje",
        "avg_deposit_cents": "Średnia wpłata",
        "avg_transfer_cents": "Średni przelew",
        "preferred_txn_hour": "Preferowana godzina",
        "dominant_device_code": "Główne urządzenie",
        "campaign_engagement_rate": "Zaangażowanie w kampanie",
        "recency_days": "Dni od ostatniej aktywności",
        "amount_trend_slope": "Trend wydatków"
      }
    },
    "segments": {
      "title": "Segmenty zachowań",
      "cluster": "Grupa",
      "members": "Członkowie"
    },
    "rules": {
      "title": "Wykryte wzorce",
      "if": "Jeśli",
      "then": "to",
      "support": "Wsparcie",
      "confidence": "Pewność",
      "lift": "Lift"
    },
    "status": {
      "running": "W toku",
      "success": "Sukces",
      "error": "Błąd"
    },
    "empty": {
      "no_features": "Brak cech — uruchom eksplorację, aby je wygenerować.",
      "no_rules": "Nie wykryto jeszcze żadnych wzorców.",
      "no_runs": "Brak zarejestrowanych uruchomień."
    },
    "errors": {
      "unauthorized": "Zaloguj się, aby kontynuować.",
      "forbidden": "Nie masz dostępu do tych danych.",
      "load_failed": "Nie udało się wczytać danych. Spróbuj ponownie."
    },
    "tooltips": {
      "confidence": "Jak często wzorzec się sprawdza, gdy warunek jest spełniony.",
      "lift": "O ile bardziej prawdopodobny jest wynik względem przypadku.",
      "segment": "Grupa użytkowników o podobnym zachowaniu."
    },
    "meta": {
      "title": "Eksploracja danych COS — SignalBoost",
      "description": "Sygnały behawioralne i transakcyjne zasilające prognozy COS."
    },
    "dashboard": {
      "overview": "Przegląd",
      "refresh": "Odśwież",
      "run_history": "Historia uruchomień",
      "segment_distribution": "Rozkład segmentów",
      "top_patterns": "Najważniejsze wzorce",
      "no_access": "Wymagany dostęp administratora, aby zobaczyć analitykę eksploracji.",
      "lookup_user": "Wyszukiwanie cech użytkownika",
      "user_id_placeholder": "Podaj identyfikator użytkownika",
      "view": "Pokaż",
      "never": "Nigdy",
      "users": "użytkownicy"
    },
    "predict": {
      "title": "Przewidywane kolejne działania",
      "action": "Działanie",
      "score": "Wynik",
      "basis": "Dlaczego",
      "none": "Za mało sygnału, aby przewidywać.",
      "propensity": "Skłonność",
      "engagement": "Zaangażowanie",
      "churn_risk": "Ryzyko odejścia",
      "value": "Wartość"
    }
  }
}

const ru: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "Анализ",
      "features": "Признаки",
      "segments": "Сегменты",
      "rules": "Закономерности",
      "runs": "История"
    },
    "mining": {
      "title": "Интеллектуальный анализ данных",
      "subtitle": "Поведенческие и транзакционные закономерности для прогнозов",
      "run_now": "Запустить",
      "last_run": "Последний запуск",
      "events_scanned": "Обработано событий",
      "users_processed": "Обработано пользователей",
      "features_written": "Сформировано признаков",
      "rules_found": "Найдено закономерностей"
    },
    "features": {
      "title": "Извлечённые признаки",
      "name": "Признак",
      "value": "Значение",
      "updated": "Обновлено",
      "names": {
        "event_frequency_per_day": "Активность в день",
        "transaction_count": "Транзакции",
        "avg_deposit_cents": "Средний депозит",
        "avg_transfer_cents": "Средний перевод",
        "preferred_txn_hour": "Предпочитаемый час",
        "dominant_device_code": "Основное устройство",
        "campaign_engagement_rate": "Вовлечённость в кампании",
        "recency_days": "Дней с последней активности",
        "amount_trend_slope": "Тренд расходов"
      }
    },
    "segments": {
      "title": "Поведенческие сегменты",
      "cluster": "Группа",
      "members": "Участники"
    },
    "rules": {
      "title": "Обнаруженные закономерности",
      "if": "Если",
      "then": "то",
      "support": "Поддержка",
      "confidence": "Достоверность",
      "lift": "Лифт"
    },
    "status": {
      "running": "Выполняется",
      "success": "Успешно",
      "error": "Ошибка"
    },
    "empty": {
      "no_features": "Признаков пока нет — запустите анализ, чтобы их сформировать.",
      "no_rules": "Закономерности пока не обнаружены.",
      "no_runs": "Запусков пока нет."
    },
    "errors": {
      "unauthorized": "Войдите, чтобы продолжить.",
      "forbidden": "У вас нет доступа к этим данным.",
      "load_failed": "Не удалось загрузить данные. Попробуйте ещё раз."
    },
    "tooltips": {
      "confidence": "Как часто закономерность подтверждается при выполнении условия.",
      "lift": "Насколько результат вероятнее по сравнению со случайностью.",
      "segment": "Группа пользователей со схожим поведением."
    },
    "meta": {
      "title": "Анализ данных COS — SignalBoost",
      "description": "Поведенческие и транзакционные сигналы, питающие прогнозы COS."
    },
    "dashboard": {
      "overview": "Обзор",
      "refresh": "Обновить",
      "run_history": "История запусков",
      "segment_distribution": "Распределение сегментов",
      "top_patterns": "Главные закономерности",
      "no_access": "Для просмотра аналитики анализа требуется доступ администратора.",
      "lookup_user": "Поиск признаков пользователя",
      "user_id_placeholder": "Введите ID пользователя",
      "view": "Открыть",
      "never": "Никогда",
      "users": "пользователей"
    },
    "predict": {
      "title": "Прогноз следующих действий",
      "action": "Действие",
      "score": "Оценка",
      "basis": "Почему",
      "none": "Пока недостаточно данных для прогноза.",
      "propensity": "Склонность",
      "engagement": "Вовлечённость",
      "churn_risk": "Риск оттока",
      "value": "Ценность"
    }
  }
}

const de: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "Mining",
      "features": "Features",
      "segments": "Segmente",
      "rules": "Muster",
      "runs": "Laufverlauf"
    },
    "mining": {
      "title": "Data Mining",
      "subtitle": "Verhaltens- und Transaktionsmuster als Grundlage für Vorhersagen",
      "run_now": "Jetzt ausführen",
      "last_run": "Letzter Lauf",
      "events_scanned": "Gescannte Ereignisse",
      "users_processed": "Verarbeitete Benutzer",
      "features_written": "Geschriebene Features",
      "rules_found": "Gefundene Muster"
    },
    "features": {
      "title": "Extrahierte Features",
      "name": "Feature",
      "value": "Wert",
      "updated": "Aktualisiert",
      "names": {
        "event_frequency_per_day": "Aktivität pro Tag",
        "transaction_count": "Transaktionen",
        "avg_deposit_cents": "Durchschnittliche Einzahlung",
        "avg_transfer_cents": "Durchschnittliche Überweisung",
        "preferred_txn_hour": "Bevorzugte Uhrzeit",
        "dominant_device_code": "Hauptgerät",
        "campaign_engagement_rate": "Kampagneninteraktion",
        "recency_days": "Tage seit letzter Aktivität",
        "amount_trend_slope": "Ausgabentrend"
      }
    },
    "segments": {
      "title": "Verhaltenssegmente",
      "cluster": "Cluster",
      "members": "Mitglieder"
    },
    "rules": {
      "title": "Erkannte Muster",
      "if": "Wenn",
      "then": "dann",
      "support": "Support",
      "confidence": "Konfidenz",
      "lift": "Lift"
    },
    "status": {
      "running": "Wird ausgeführt",
      "success": "Erfolg",
      "error": "Fehler"
    },
    "empty": {
      "no_features": "Noch keine Features – führen Sie einen Mining-Job aus, um sie zu befüllen.",
      "no_rules": "Noch keine Muster erkannt.",
      "no_runs": "Noch keine Mining-Läufe aufgezeichnet."
    },
    "errors": {
      "unauthorized": "Bitte melden Sie sich an, um fortzufahren.",
      "forbidden": "Sie haben keinen Zugriff auf diese Daten.",
      "load_failed": "Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut."
    },
    "tooltips": {
      "confidence": "Wie oft das Muster zutrifft, wenn die Bedingung erfüllt ist.",
      "lift": "Wie viel wahrscheinlicher das Ergebnis im Vergleich zum Zufall ist.",
      "segment": "Gruppe von Benutzern mit ähnlichem Verhalten."
    },
    "meta": {
      "title": "COS Data Mining — SignalBoost",
      "description": "Extrahierte Verhaltens- und Transaktionssignale, die COS-Vorhersagen antreiben."
    },
    "dashboard": {
      "overview": "Übersicht",
      "refresh": "Aktualisieren",
      "run_history": "Ausführungsverlauf",
      "segment_distribution": "Segmentverteilung",
      "top_patterns": "Top-Muster",
      "no_access": "Zum Anzeigen der Mining-Intelligence ist Administratorzugriff erforderlich.",
      "lookup_user": "Benutzer-Feature-Suche",
      "user_id_placeholder": "Benutzer-ID eingeben",
      "view": "Anzeigen",
      "never": "Nie",
      "users": "Benutzer"
    },
    "predict": {
      "title": "Vorhergesagte nächste Aktionen",
      "action": "Aktion",
      "score": "Bewertung",
      "basis": "Begründung",
      "none": "Noch nicht genug Signale für eine Vorhersage.",
      "propensity": "Neigung",
      "engagement": "Interaktion",
      "churn_risk": "Abwanderungsrisiko",
      "value": "Wert"
    }
  }
}

const fr: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "Minage",
      "features": "Caractéristiques",
      "segments": "Segments",
      "rules": "Modèles",
      "runs": "Historique des exécutions"
    },
    "mining": {
      "title": "Exploration de données",
      "subtitle": "Modèles comportementaux et transactionnels qui alimentent les prédictions",
      "run_now": "Exécuter maintenant",
      "last_run": "Dernière exécution",
      "events_scanned": "Événements analysés",
      "users_processed": "Utilisateurs traités",
      "features_written": "Caractéristiques écrites",
      "rules_found": "Modèles trouvés"
    },
    "features": {
      "title": "Caractéristiques extraites",
      "name": "Caractéristique",
      "value": "Valeur",
      "updated": "Mis à jour",
      "names": {
        "event_frequency_per_day": "Activité par jour",
        "transaction_count": "Transactions",
        "avg_deposit_cents": "Dépôt moyen",
        "avg_transfer_cents": "Virement moyen",
        "preferred_txn_hour": "Heure préférée",
        "dominant_device_code": "Appareil principal",
        "campaign_engagement_rate": "Engagement envers les campagnes",
        "recency_days": "Jours depuis la dernière activité",
        "amount_trend_slope": "Tendance des dépenses"
      }
    },
    "segments": {
      "title": "Segments comportementaux",
      "cluster": "Cluster",
      "members": "Membres"
    },
    "rules": {
      "title": "Modèles détectés",
      "if": "Si",
      "then": "alors",
      "support": "Assistance",
      "confidence": "Confiance",
      "lift": "Lift"
    },
    "status": {
      "running": "En cours",
      "success": "Succès",
      "error": "Erreur"
    },
    "empty": {
      "no_features": "Aucune caractéristique pour l’instant — lancez une tâche de minage pour les générer.",
      "no_rules": "Aucun modèle détecté pour l’instant.",
      "no_runs": "Aucune exécution de minage enregistrée pour l’instant."
    },
    "errors": {
      "unauthorized": "Veuillez vous connecter pour continuer.",
      "forbidden": "Vous n’avez pas accès à ces données.",
      "load_failed": "Impossible de charger les données. Veuillez réessayer."
    },
    "tooltips": {
      "confidence": "Fréquence à laquelle le modèle se vérifie lorsque la condition est remplie.",
      "lift": "Dans quelle mesure le résultat est plus probable que le hasard.",
      "segment": "Groupe d’utilisateurs au comportement similaire."
    },
    "meta": {
      "title": "Exploration de données COS — SignalBoost",
      "description": "Signaux comportementaux et transactionnels extraits qui alimentent les prédictions de COS."
    },
    "dashboard": {
      "overview": "Vue d’ensemble",
      "refresh": "Actualiser",
      "run_history": "Historique des exécutions",
      "segment_distribution": "Répartition des segments",
      "top_patterns": "Principaux modèles",
      "no_access": "Un accès administrateur est requis pour consulter l’intelligence de minage.",
      "lookup_user": "Recherche des caractéristiques utilisateur",
      "user_id_placeholder": "Saisissez l’ID utilisateur",
      "view": "Voir",
      "never": "Jamais",
      "users": "utilisateurs"
    },
    "predict": {
      "title": "Prochaines actions prévues",
      "action": "Action",
      "score": "Score",
      "basis": "Motif",
      "none": "Pas encore assez de signaux pour prédire.",
      "propensity": "Propension",
      "engagement": "Engagement",
      "churn_risk": "Risque d’attrition",
      "value": "Valeur"
    }
  }
}

const it: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "Mining",
      "features": "Caratteristiche",
      "segments": "Segmenti",
      "rules": "Pattern",
      "runs": "Cronologia esecuzioni"
    },
    "mining": {
      "title": "Data mining",
      "subtitle": "Pattern comportamentali e transazionali alla base delle previsioni",
      "run_now": "Esegui ora",
      "last_run": "Ultima esecuzione",
      "events_scanned": "Eventi analizzati",
      "users_processed": "Utenti elaborati",
      "features_written": "Caratteristiche scritte",
      "rules_found": "Pattern trovati"
    },
    "features": {
      "title": "Caratteristiche estratte",
      "name": "Caratteristica",
      "value": "Valore",
      "updated": "Aggiornato",
      "names": {
        "event_frequency_per_day": "Attività al giorno",
        "transaction_count": "Transazioni",
        "avg_deposit_cents": "Deposito medio",
        "avg_transfer_cents": "Trasferimento medio",
        "preferred_txn_hour": "Ora preferita",
        "dominant_device_code": "Dispositivo principale",
        "campaign_engagement_rate": "Coinvolgimento nelle campagne",
        "recency_days": "Giorni dall’ultima attività",
        "amount_trend_slope": "Andamento della spesa"
      }
    },
    "segments": {
      "title": "Segmenti comportamentali",
      "cluster": "Cluster",
      "members": "Membri"
    },
    "rules": {
      "title": "Pattern rilevati",
      "if": "Se",
      "then": "allora",
      "support": "Supporto",
      "confidence": "Affidabilità",
      "lift": "Lift"
    },
    "status": {
      "running": "In esecuzione",
      "success": "Operazione riuscita",
      "error": "Errore"
    },
    "empty": {
      "no_features": "Ancora nessuna caratteristica: esegui un job di mining per popolarle.",
      "no_rules": "Nessun pattern rilevato finora.",
      "no_runs": "Nessuna esecuzione di mining registrata finora."
    },
    "errors": {
      "unauthorized": "Accedi per continuare.",
      "forbidden": "Non hai accesso a questi dati.",
      "load_failed": "Impossibile caricare i dati. Riprova."
    },
    "tooltips": {
      "confidence": "Quanto spesso il pattern si verifica quando la condizione è soddisfatta.",
      "lift": "Quanto il risultato è più probabile rispetto al caso.",
      "segment": "Gruppo di utenti con comportamento simile."
    },
    "meta": {
      "title": "Data mining COS — SignalBoost",
      "description": "Segnali comportamentali e transazionali estratti che alimentano le previsioni di COS."
    },
    "dashboard": {
      "overview": "Panoramica",
      "refresh": "Aggiorna",
      "run_history": "Cronologia delle esecuzioni",
      "segment_distribution": "Distribuzione dei segmenti",
      "top_patterns": "Pattern principali",
      "no_access": "È necessario l’accesso amministratore per visualizzare l’intelligence di mining.",
      "lookup_user": "Ricerca caratteristiche utente",
      "user_id_placeholder": "Inserisci l’ID utente",
      "view": "Visualizza",
      "never": "Mai",
      "users": "utenti"
    },
    "predict": {
      "title": "Prossime azioni previste",
      "action": "Azione",
      "score": "Punteggio",
      "basis": "Motivo",
      "none": "Segnali ancora insufficienti per una previsione.",
      "propensity": "Propensione",
      "engagement": "Coinvolgimento",
      "churn_risk": "Rischio di abbandono",
      "value": "Valore"
    }
  }
}

const ja: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "マイニング",
      "features": "特徴量",
      "segments": "セグメント",
      "rules": "パターン",
      "runs": "実行履歴"
    },
    "mining": {
      "title": "データマイニング",
      "subtitle": "予測を支える行動パターンと取引パターン",
      "run_now": "今すぐ実行",
      "last_run": "最終実行",
      "events_scanned": "スキャンしたイベント",
      "users_processed": "処理済みユーザー",
      "features_written": "書き込まれた特徴量",
      "rules_found": "検出されたパターン"
    },
    "features": {
      "title": "抽出された特徴量",
      "name": "特徴量",
      "value": "値",
      "updated": "更新済み",
      "names": {
        "event_frequency_per_day": "1日あたりのアクティビティ",
        "transaction_count": "取引",
        "avg_deposit_cents": "平均入金額",
        "avg_transfer_cents": "平均送金額",
        "preferred_txn_hour": "希望時間帯",
        "dominant_device_code": "メインデバイス",
        "campaign_engagement_rate": "キャンペーンエンゲージメント",
        "recency_days": "最終アクティビティからの日数",
        "amount_trend_slope": "支出傾向"
      }
    },
    "segments": {
      "title": "行動セグメント",
      "cluster": "クラスター",
      "members": "メンバー"
    },
    "rules": {
      "title": "検出されたパターン",
      "if": "条件",
      "then": "ならば",
      "support": "サポート",
      "confidence": "信頼度",
      "lift": "リフト"
    },
    "status": {
      "running": "実行中",
      "success": "成功",
      "error": "エラー"
    },
    "empty": {
      "no_features": "特徴量はまだありません。マイニングジョブを実行して生成してください。",
      "no_rules": "パターンはまだ検出されていません。",
      "no_runs": "マイニングの実行記録はまだありません。"
    },
    "errors": {
      "unauthorized": "続行するにはサインインしてください。",
      "forbidden": "このデータへのアクセス権がありません。",
      "load_failed": "データを読み込めませんでした。もう一度お試しください。"
    },
    "tooltips": {
      "confidence": "条件が満たされたときにパターンが成立する頻度。",
      "lift": "偶然と比べて結果がどれだけ起こりやすいか。",
      "segment": "類似した行動を持つユーザーのグループ。"
    },
    "meta": {
      "title": "COS データマイニング — SignalBoost",
      "description": "COS の予測を支える、抽出された行動シグナルと取引シグナル。"
    },
    "dashboard": {
      "overview": "概要",
      "refresh": "更新",
      "run_history": "実行履歴",
      "segment_distribution": "セグメント分布",
      "top_patterns": "上位パターン",
      "no_access": "マイニングインテリジェンスを表示するには管理者アクセスが必要です。",
      "lookup_user": "ユーザー特徴量の検索",
      "user_id_placeholder": "ユーザー ID を入力",
      "view": "表示",
      "never": "なし",
      "users": "ユーザー"
    },
    "predict": {
      "title": "予測される次のアクション",
      "action": "アクション",
      "score": "スコア",
      "basis": "理由",
      "none": "予測に十分なシグナルがまだありません。",
      "propensity": "傾向スコア",
      "engagement": "エンゲージメント",
      "churn_risk": "解約リスク",
      "value": "値"
    }
  }
}

const ko: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "마이닝",
      "features": "특성",
      "segments": "세그먼트",
      "rules": "패턴",
      "runs": "실행 기록"
    },
    "mining": {
      "title": "데이터 마이닝",
      "subtitle": "예측을 뒷받침하는 행동 및 거래 패턴",
      "run_now": "지금 실행",
      "last_run": "마지막 실행",
      "events_scanned": "스캔한 이벤트",
      "users_processed": "처리된 사용자",
      "features_written": "기록된 특성",
      "rules_found": "발견된 패턴"
    },
    "features": {
      "title": "추출된 특성",
      "name": "특성",
      "value": "값",
      "updated": "업데이트됨",
      "names": {
        "event_frequency_per_day": "일일 활동",
        "transaction_count": "거래",
        "avg_deposit_cents": "평균 입금액",
        "avg_transfer_cents": "평균 이체액",
        "preferred_txn_hour": "선호 시간대",
        "dominant_device_code": "주 사용 기기",
        "campaign_engagement_rate": "캠페인 참여도",
        "recency_days": "마지막 활동 이후 일수",
        "amount_trend_slope": "지출 추세"
      }
    },
    "segments": {
      "title": "행동 세그먼트",
      "cluster": "클러스터",
      "members": "구성원"
    },
    "rules": {
      "title": "감지된 패턴",
      "if": "조건",
      "then": "결과",
      "support": "지원",
      "confidence": "신뢰도",
      "lift": "리프트"
    },
    "status": {
      "running": "실행 중",
      "success": "성공",
      "error": "오류"
    },
    "empty": {
      "no_features": "아직 특성이 없습니다. 마이닝 작업을 실행하여 채우세요.",
      "no_rules": "아직 감지된 패턴이 없습니다.",
      "no_runs": "아직 기록된 마이닝 실행이 없습니다."
    },
    "errors": {
      "unauthorized": "계속하려면 로그인하세요.",
      "forbidden": "이 데이터에 대한 액세스 권한이 없습니다.",
      "load_failed": "데이터를 불러올 수 없습니다. 다시 시도하세요."
    },
    "tooltips": {
      "confidence": "조건이 충족될 때 패턴이 성립하는 빈도입니다.",
      "lift": "우연 대비 결과가 얼마나 더 발생하기 쉬운지를 나타냅니다.",
      "segment": "유사한 행동을 보이는 사용자 그룹입니다."
    },
    "meta": {
      "title": "COS 데이터 마이닝 — SignalBoost",
      "description": "COS 예측을 뒷받침하는 추출된 행동 및 거래 신호입니다."
    },
    "dashboard": {
      "overview": "개요",
      "refresh": "새로 고침",
      "run_history": "실행 기록",
      "segment_distribution": "세그먼트 분포",
      "top_patterns": "주요 패턴",
      "no_access": "마이닝 인텔리전스를 보려면 관리자 액세스 권한이 필요합니다.",
      "lookup_user": "사용자 특성 조회",
      "user_id_placeholder": "사용자 ID 입력",
      "view": "보기",
      "never": "없음",
      "users": "사용자"
    },
    "predict": {
      "title": "예측된 다음 행동",
      "action": "작업",
      "score": "점수",
      "basis": "근거",
      "none": "아직 예측할 만큼 신호가 충분하지 않습니다.",
      "propensity": "성향",
      "engagement": "참여도",
      "churn_risk": "이탈 위험",
      "value": "값"
    }
  }
}

const ar: Record<string, any> = {
  "cos": {
    "nav": {
      "mining": "التنقيب",
      "features": "الخصائص",
      "segments": "الشرائح",
      "rules": "الأنماط",
      "runs": "سجل التشغيل"
    },
    "mining": {
      "title": "التنقيب في البيانات",
      "subtitle": "أنماط سلوكية ومعاملاتية تدعم التنبؤات",
      "run_now": "تشغيل الآن",
      "last_run": "آخر تشغيل",
      "events_scanned": "الأحداث التي تم فحصها",
      "users_processed": "المستخدمون الذين تمت معالجتهم",
      "features_written": "الخصائص المكتوبة",
      "rules_found": "الأنماط المكتشفة"
    },
    "features": {
      "title": "الخصائص المستخرجة",
      "name": "الخاصية",
      "value": "القيمة",
      "updated": "تم التحديث",
      "names": {
        "event_frequency_per_day": "النشاط اليومي",
        "transaction_count": "المعاملات",
        "avg_deposit_cents": "متوسط الإيداع",
        "avg_transfer_cents": "متوسط التحويل",
        "preferred_txn_hour": "الساعة المفضلة",
        "dominant_device_code": "الجهاز الرئيسي",
        "campaign_engagement_rate": "التفاعل مع الحملات",
        "recency_days": "أيام منذ آخر نشاط",
        "amount_trend_slope": "اتجاه الإنفاق"
      }
    },
    "segments": {
      "title": "الشرائح السلوكية",
      "cluster": "المجموعة",
      "members": "الأعضاء"
    },
    "rules": {
      "title": "الأنماط المكتشفة",
      "if": "إذا",
      "then": "فإن",
      "support": "الدعم",
      "confidence": "الثقة",
      "lift": "الرفع"
    },
    "status": {
      "running": "قيد التشغيل",
      "success": "نجاح",
      "error": "خطأ"
    },
    "empty": {
      "no_features": "لا توجد خصائص بعد — شغّل مهمة تنقيب لملئها.",
      "no_rules": "لم تُكتشف أي أنماط بعد.",
      "no_runs": "لم تُسجَّل أي عمليات تنقيب بعد."
    },
    "errors": {
      "unauthorized": "يُرجى تسجيل الدخول للمتابعة.",
      "forbidden": "ليس لديك صلاحية الوصول إلى هذه البيانات.",
      "load_failed": "تعذّر تحميل البيانات. يُرجى المحاولة مرة أخرى."
    },
    "tooltips": {
      "confidence": "عدد مرات تحقق النمط عند استيفاء الشرط.",
      "lift": "مدى ارتفاع احتمال النتيجة مقارنةً بالصدفة.",
      "segment": "مجموعة من المستخدمين ذوي سلوك متشابه."
    },
    "meta": {
      "title": "التنقيب في بيانات COS — SignalBoost",
      "description": "إشارات سلوكية ومعاملاتية مستخرجة تدعم تنبؤات COS."
    },
    "dashboard": {
      "overview": "نظرة عامة",
      "refresh": "تحديث",
      "run_history": "سجل التشغيل",
      "segment_distribution": "توزيع الشرائح",
      "top_patterns": "أبرز الأنماط",
      "no_access": "يلزم وصول المسؤول لعرض ذكاء التنقيب.",
      "lookup_user": "البحث عن خصائص المستخدم",
      "user_id_placeholder": "أدخل معرّف المستخدم",
      "view": "عرض",
      "never": "أبدًا",
      "users": "مستخدمون"
    },
    "predict": {
      "title": "الإجراءات التالية المتوقعة",
      "action": "الإجراء",
      "score": "النتيجة",
      "basis": "السبب",
      "none": "لا توجد إشارات كافية للتنبؤ بعد.",
      "propensity": "الميل",
      "engagement": "التفاعل",
      "churn_risk": "خطر التسرّب",
      "value": "القيمة"
    }
  }
}

export const COS_DICTS: Record<CosLang, Record<string, any>> = { en, es, pt, pl, ru, de, fr, it, ja, ko, ar }
