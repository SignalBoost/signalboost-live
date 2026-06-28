// saas/lib/cos/i18n/dictionaries.ts
// Bundled COS i18n dictionaries — the PORTABLE source of truth for the module's five
// languages (en/es/pt/pl/ru). Bundling here (instead of importing /locales/*.json) keeps
// the module self-contained: the whole lib/cos folder moves to another project as a unit
// with no external file dependency. Structure is identical across languages (enforced by
// scripts/verify-cos-locale-parity.mjs against the standalone /locales/cos.*.json copies).

export type CosLang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export const COS_LANGS: CosLang[] = ['en', 'es', 'pt', 'pl', 'ru']

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

export const COS_DICTS: Record<CosLang, Record<string, any>> = { en, es, pt, pl, ru }
