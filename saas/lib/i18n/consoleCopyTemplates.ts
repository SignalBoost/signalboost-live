// saas/lib/i18n/consoleCopyTemplates.ts
//
// Phase 2 console i18n: per-action card titles (label) + one-line descriptions,
// for the live providers. Merged into HUB_STRINGS by consoleCopy.ts so the same
// cHub() resolver + English fallback applies. Keyed hub.tpl.<templateId>.label/.desc.
// PL/RU are careful translations; native review recommended before a white-label sale.

type Five = { en: string; es: string; pt: string; pl: string; ru: string }

export const HUB_TEMPLATE_STRINGS: Record<string, Five> = {
  // ---- GitHub ----
  'hub.tpl.github.list_repos.label': { en: 'View Repos', es: 'Ver Repositorios', pt: 'Ver Repositórios', pl: 'Zobacz Repozytoria', ru: 'Просмотр репозиториев' },
  'hub.tpl.github.list_repos.desc': { en: 'List repositories visible to the configured access token.', es: 'Lista los repositorios visibles para el token de acceso configurado.', pt: 'Lista os repositórios visíveis para o token de acesso configurado.', pl: 'Wyświetla repozytoria widoczne dla skonfigurowanego tokena dostępu.', ru: 'Список репозиториев, доступных настроенному токену доступа.' },
  'hub.tpl.github.list_prs.label': { en: 'List Pull Requests', es: 'Listar Pull Requests', pt: 'Listar Pull Requests', pl: 'Lista Pull Requestów', ru: 'Список pull-запросов' },
  'hub.tpl.github.list_prs.desc': { en: 'Show open pull requests (newest first) for a repository.', es: 'Muestra los pull requests abiertos (más recientes primero) de un repositorio.', pt: 'Mostra os pull requests abertos (mais recentes primeiro) de um repositório.', pl: 'Pokazuje otwarte pull requesty (od najnowszych) dla repozytorium.', ru: 'Показывает открытые pull-запросы (сначала новые) для репозитория.' },
  'hub.tpl.github.view_pr_files.label': { en: 'View PR Files', es: 'Ver Archivos del PR', pt: 'Ver Arquivos do PR', pl: 'Zobacz Pliki PR', ru: 'Файлы PR' },
  'hub.tpl.github.view_pr_files.desc': { en: 'List the files changed in a pull request.', es: 'Lista los archivos modificados en un pull request.', pt: 'Lista os arquivos alterados em um pull request.', pl: 'Wyświetla pliki zmienione w pull requeście.', ru: 'Список файлов, изменённых в pull-запросе.' },
  'hub.tpl.github.merge_pr.label': { en: 'Merge PR', es: 'Fusionar PR', pt: 'Fazer Merge do PR', pl: 'Scal PR', ru: 'Слить PR' },
  'hub.tpl.github.merge_pr.desc': { en: 'Merge a pull request into its base branch.', es: 'Fusiona un pull request en su rama base.', pt: 'Faz o merge de um pull request na sua ramificação base.', pl: 'Scala pull request z gałęzią bazową.', ru: 'Сливает pull-запрос в его базовую ветку.' },
  'hub.tpl.github.close_pr.label': { en: 'Close PR', es: 'Cerrar PR', pt: 'Fechar PR', pl: 'Zamknij PR', ru: 'Закрыть PR' },
  'hub.tpl.github.close_pr.desc': { en: 'Close a pull request without merging.', es: 'Cierra un pull request sin fusionarlo.', pt: 'Fecha um pull request sem fazer merge.', pl: 'Zamyka pull request bez scalania.', ru: 'Закрывает pull-запрос без слияния.' },
  'hub.tpl.github.list_branches.label': { en: 'List Branches', es: 'Listar Ramas', pt: 'Listar Ramificações', pl: 'Lista Gałęzi', ru: 'Список веток' },
  'hub.tpl.github.list_branches.desc': { en: 'List branches in a repository (useful for ai/* cleanup).', es: 'Lista las ramas de un repositorio (útil para limpiar ai/*).', pt: 'Lista as ramificações de um repositório (útil para limpeza de ai/*).', pl: 'Wyświetla gałęzie repozytorium (przydatne do czyszczenia ai/*).', ru: 'Список веток репозитория (полезно для очистки ai/*).' },
  'hub.tpl.github.delete_branch.label': { en: 'Delete Branch', es: 'Eliminar Rama', pt: 'Excluir Ramificação', pl: 'Usuń Gałąź', ru: 'Удалить ветку' },
  'hub.tpl.github.delete_branch.desc': { en: 'Delete a branch by name (main is protected).', es: 'Elimina una rama por nombre (main está protegida).', pt: 'Exclui uma ramificação por nome (main é protegida).', pl: 'Usuwa gałąź po nazwie (main jest chroniona).', ru: 'Удаляет ветку по имени (main защищена).' },
  'hub.tpl.github.list_commits.label': { en: 'Recent Commits', es: 'Commits Recientes', pt: 'Commits Recentes', pl: 'Ostatnie Commity', ru: 'Последние коммиты' },
  'hub.tpl.github.list_commits.desc': { en: 'Show the most recent commits on a repository.', es: 'Muestra los commits más recientes de un repositorio.', pt: 'Mostra os commits mais recentes de um repositório.', pl: 'Pokazuje najnowsze commity w repozytorium.', ru: 'Показывает последние коммиты репозитория.' },
  'hub.tpl.github.list_issues.label': { en: 'List Issues', es: 'Listar Incidencias', pt: 'Listar Issues', pl: 'Lista Zgłoszeń', ru: 'Список задач' },
  'hub.tpl.github.list_issues.desc': { en: 'Show open issues for a repository.', es: 'Muestra las incidencias abiertas de un repositorio.', pt: 'Mostra as issues abertas de um repositório.', pl: 'Pokazuje otwarte zgłoszenia repozytorium.', ru: 'Показывает открытые задачи репозитория.' },
  'hub.tpl.github.open_issue.label': { en: 'Open Issue', es: 'Abrir Incidencia', pt: 'Abrir Issue', pl: 'Otwórz Zgłoszenie', ru: 'Создать задачу' },
  'hub.tpl.github.open_issue.desc': { en: 'Create a new issue on a repository.', es: 'Crea una nueva incidencia en un repositorio.', pt: 'Cria uma nova issue em um repositório.', pl: 'Tworzy nowe zgłoszenie w repozytorium.', ru: 'Создаёт новую задачу в репозитории.' },
  'hub.tpl.github.edit_issue.label': { en: 'Edit Issue', es: 'Editar Incidencia', pt: 'Editar Issue', pl: 'Edytuj Zgłoszenie', ru: 'Изменить задачу' },
  'hub.tpl.github.edit_issue.desc': { en: 'Update an issue title or open/closed state.', es: 'Actualiza el título o el estado (abierto/cerrado) de una incidencia.', pt: 'Atualiza o título ou o estado (aberto/fechado) de uma issue.', pl: 'Aktualizuje tytuł lub stan (otwarte/zamknięte) zgłoszenia.', ru: 'Обновляет заголовок или статус (открыта/закрыта) задачи.' },
  'hub.tpl.github.close_issue.label': { en: 'Close Issue', es: 'Cerrar Incidencia', pt: 'Fechar Issue', pl: 'Zamknij Zgłoszenie', ru: 'Закрыть задачу' },
  'hub.tpl.github.close_issue.desc': { en: 'Close an open issue.', es: 'Cierra una incidencia abierta.', pt: 'Fecha uma issue aberta.', pl: 'Zamyka otwarte zgłoszenie.', ru: 'Закрывает открытую задачу.' },
  'hub.tpl.github.rotate_token.label': { en: 'Rotate Token', es: 'Rotar Token', pt: 'Rotacionar Token', pl: 'Rotuj Token', ru: 'Ротация токена' },
  'hub.tpl.github.rotate_token.desc': { en: 'Rotate the stored GitHub access token (revoke + reissue).', es: 'Rota el token de acceso de GitHub almacenado (revocar + reemitir).', pt: 'Rotaciona o token de acesso do GitHub armazenado (revogar + reemitir).', pl: 'Rotuje zapisany token dostępu GitHub (unieważnij + wydaj ponownie).', ru: 'Ротация сохранённого токена доступа GitHub (отзыв + перевыпуск).' },
  'hub.tpl.github.manage_secrets.label': { en: 'Manage Secrets', es: 'Gestionar Secretos', pt: 'Gerenciar Segredos', pl: 'Zarządzaj Sekretami', ru: 'Управление секретами' },
  'hub.tpl.github.manage_secrets.desc': { en: 'Create or update an Actions secret on a repository.', es: 'Crea o actualiza un secreto de Actions en un repositorio.', pt: 'Cria ou atualiza um segredo do Actions em um repositório.', pl: 'Tworzy lub aktualizuje sekret Actions w repozytorium.', ru: 'Создаёт или обновляет секрет Actions в репозитории.' },

  // ---- OpenAI ----
  'hub.tpl.openai.list_models.label': { en: 'View Models', es: 'Ver Modelos', pt: 'Ver Modelos', pl: 'Zobacz Modele', ru: 'Просмотр моделей' },
  'hub.tpl.openai.list_models.desc': { en: 'List models available to the configured API key.', es: 'Lista los modelos disponibles para la clave API configurada.', pt: 'Lista os modelos disponíveis para a chave de API configurada.', pl: 'Wyświetla modele dostępne dla skonfigurowanego klucza API.', ru: 'Список моделей, доступных настроенному API-ключу.' },
  'hub.tpl.openai.retrieve_model.label': { en: 'Model Details', es: 'Detalles del Modelo', pt: 'Detalhes do Modelo', pl: 'Szczegóły Modelu', ru: 'Сведения о модели' },
  'hub.tpl.openai.retrieve_model.desc': { en: 'Show details for a specific model.', es: 'Muestra los detalles de un modelo específico.', pt: 'Mostra os detalhes de um modelo específico.', pl: 'Pokazuje szczegóły wybranego modelu.', ru: 'Показывает сведения о конкретной модели.' },
  'hub.tpl.openai.list_files.label': { en: 'List Files', es: 'Listar Archivos', pt: 'Listar Arquivos', pl: 'Lista Plików', ru: 'Список файлов' },
  'hub.tpl.openai.list_files.desc': { en: 'Files uploaded to the OpenAI account.', es: 'Archivos subidos a la cuenta de OpenAI.', pt: 'Arquivos enviados para a conta da OpenAI.', pl: 'Pliki przesłane na konto OpenAI.', ru: 'Файлы, загруженные в аккаунт OpenAI.' },
  'hub.tpl.openai.list_fine_tunes.label': { en: 'Fine-tuning Jobs', es: 'Trabajos de Ajuste Fino', pt: 'Trabalhos de Fine-tuning', pl: 'Zadania Fine-tuningu', ru: 'Задания дообучения' },
  'hub.tpl.openai.list_fine_tunes.desc': { en: 'Recent fine-tuning jobs and their status.', es: 'Trabajos de ajuste fino recientes y su estado.', pt: 'Trabalhos de fine-tuning recentes e seu status.', pl: 'Ostatnie zadania fine-tuningu i ich status.', ru: 'Последние задания дообучения и их статус.' },
  'hub.tpl.openai.list_batches.label': { en: 'Batch Jobs', es: 'Trabajos por Lotes', pt: 'Trabalhos em Lote', pl: 'Zadania Wsadowe', ru: 'Пакетные задания' },
  'hub.tpl.openai.list_batches.desc': { en: 'Recent batch jobs and their status.', es: 'Trabajos por lotes recientes y su estado.', pt: 'Trabalhos em lote recentes e seu status.', pl: 'Ostatnie zadania wsadowe i ich status.', ru: 'Последние пакетные задания и их статус.' },

  // ---- ElevenLabs ----
  'hub.tpl.elevenlabs.list_voices.label': { en: 'List Voices', es: 'Listar Voces', pt: 'Listar Vozes', pl: 'Lista Głosów', ru: 'Список голосов' },
  'hub.tpl.elevenlabs.list_voices.desc': { en: 'Voices available to the account.', es: 'Voces disponibles para la cuenta.', pt: 'Vozes disponíveis para a conta.', pl: 'Głosy dostępne dla konta.', ru: 'Голоса, доступные аккаунту.' },
  'hub.tpl.elevenlabs.voice_details.label': { en: 'Voice Details', es: 'Detalles de la Voz', pt: 'Detalhes da Voz', pl: 'Szczegóły Głosu', ru: 'Сведения о голосе' },
  'hub.tpl.elevenlabs.voice_details.desc': { en: 'Inspect a specific voice.', es: 'Inspecciona una voz específica.', pt: 'Inspeciona uma voz específica.', pl: 'Sprawdź wybrany głos.', ru: 'Просмотр конкретного голоса.' },
  'hub.tpl.elevenlabs.list_models.label': { en: 'List Models', es: 'Listar Modelos', pt: 'Listar Modelos', pl: 'Lista Modeli', ru: 'Список моделей' },
  'hub.tpl.elevenlabs.list_models.desc': { en: 'Speech models available to the account.', es: 'Modelos de voz disponibles para la cuenta.', pt: 'Modelos de fala disponíveis para a conta.', pl: 'Modele mowy dostępne dla konta.', ru: 'Речевые модели, доступные аккаунту.' },
  'hub.tpl.elevenlabs.subscription.label': { en: 'Subscription & Usage', es: 'Suscripción y Uso', pt: 'Assinatura e Uso', pl: 'Subskrypcja i Zużycie', ru: 'Подписка и расход' },
  'hub.tpl.elevenlabs.subscription.desc': { en: 'Plan tier and character quota usage.', es: 'Nivel del plan y uso de la cuota de caracteres.', pt: 'Nível do plano e uso da cota de caracteres.', pl: 'Poziom planu i wykorzystanie limitu znaków.', ru: 'Уровень плана и расход квоты символов.' },
  'hub.tpl.elevenlabs.list_history.label': { en: 'Generation History', es: 'Historial de Generación', pt: 'Histórico de Geração', pl: 'Historia Generowania', ru: 'История генерации' },
  'hub.tpl.elevenlabs.list_history.desc': { en: 'Recent text-to-speech generations.', es: 'Generaciones de texto a voz recientes.', pt: 'Gerações recentes de texto para fala.', pl: 'Ostatnie generacje syntezy mowy.', ru: 'Последние генерации синтеза речи.' },

  // ---- Anthropic ----
  'hub.tpl.anthropic.list_models.label': { en: 'View Models', es: 'Ver Modelos', pt: 'Ver Modelos', pl: 'Zobacz Modele', ru: 'Просмотр моделей' },
  'hub.tpl.anthropic.list_models.desc': { en: 'Models available to the API key.', es: 'Modelos disponibles para la clave API.', pt: 'Modelos disponíveis para a chave de API.', pl: 'Modele dostępne dla klucza API.', ru: 'Модели, доступные API-ключу.' },
  'hub.tpl.anthropic.retrieve_model.label': { en: 'Model Details', es: 'Detalles del Modelo', pt: 'Detalhes do Modelo', pl: 'Szczegóły Modelu', ru: 'Сведения о модели' },
  'hub.tpl.anthropic.retrieve_model.desc': { en: 'Details for a specific model.', es: 'Detalles de un modelo específico.', pt: 'Detalhes de um modelo específico.', pl: 'Szczegóły wybranego modelu.', ru: 'Сведения о конкретной модели.' },

  // ---- Gemini ----
  'hub.tpl.gemini.list_models.label': { en: 'View Models', es: 'Ver Modelos', pt: 'Ver Modelos', pl: 'Zobacz Modele', ru: 'Просмотр моделей' },
  'hub.tpl.gemini.list_models.desc': { en: 'Models available to the Gemini key.', es: 'Modelos disponibles para la clave de Gemini.', pt: 'Modelos disponíveis para a chave do Gemini.', pl: 'Modele dostępne dla klucza Gemini.', ru: 'Модели, доступные ключу Gemini.' },
  'hub.tpl.gemini.model_details.label': { en: 'Model Details', es: 'Detalles del Modelo', pt: 'Detalhes do Modelo', pl: 'Szczegóły Modelu', ru: 'Сведения о модели' },
  'hub.tpl.gemini.model_details.desc': { en: 'Details for a specific model.', es: 'Detalles de un modelo específico.', pt: 'Detalhes de um modelo específico.', pl: 'Szczegóły wybranego modelu.', ru: 'Сведения о конкретной модели.' },

  // ---- Resend ----
  'hub.tpl.resend.list_domains.label': { en: 'List Domains', es: 'Listar Dominios', pt: 'Listar Domínios', pl: 'Lista Domen', ru: 'Список доменов' },
  'hub.tpl.resend.list_domains.desc': { en: 'Sending domains and verification status.', es: 'Dominios de envío y estado de verificación.', pt: 'Domínios de envio e status de verificação.', pl: 'Domeny wysyłki i status weryfikacji.', ru: 'Домены отправки и статус верификации.' },
  'hub.tpl.resend.list_audiences.label': { en: 'List Audiences', es: 'Listar Audiencias', pt: 'Listar Públicos', pl: 'Lista Odbiorców', ru: 'Список аудиторий' },
  'hub.tpl.resend.list_audiences.desc': { en: 'Contact audiences.', es: 'Audiencias de contactos.', pt: 'Públicos de contatos.', pl: 'Grupy odbiorców kontaktów.', ru: 'Аудитории контактов.' },
  'hub.tpl.resend.list_broadcasts.label': { en: 'List Broadcasts', es: 'Listar Difusiones', pt: 'Listar Transmissões', pl: 'Lista Wysyłek', ru: 'Список рассылок' },
  'hub.tpl.resend.list_broadcasts.desc': { en: 'Recent broadcasts.', es: 'Difusiones recientes.', pt: 'Transmissões recentes.', pl: 'Ostatnie wysyłki.', ru: 'Последние рассылки.' },
  'hub.tpl.resend.list_api_keys.label': { en: 'List API Keys', es: 'Listar Claves API', pt: 'Listar Chaves de API', pl: 'Lista Kluczy API', ru: 'Список API-ключей' },
  'hub.tpl.resend.list_api_keys.desc': { en: 'API keys on the account.', es: 'Claves API de la cuenta.', pt: 'Chaves de API da conta.', pl: 'Klucze API konta.', ru: 'API-ключи аккаунта.' },

  // ---- AssemblyAI ----
  'hub.tpl.assemblyai.list_transcripts.label': { en: 'Recent Transcripts', es: 'Transcripciones Recientes', pt: 'Transcrições Recentes', pl: 'Ostatnie Transkrypcje', ru: 'Последние транскрипции' },
  'hub.tpl.assemblyai.list_transcripts.desc': { en: 'Most recent transcription jobs.', es: 'Trabajos de transcripción más recientes.', pt: 'Trabalhos de transcrição mais recentes.', pl: 'Najnowsze zadania transkrypcji.', ru: 'Самые недавние задания транскрипции.' },
  'hub.tpl.assemblyai.transcript_details.label': { en: 'Transcript Details', es: 'Detalles de la Transcripción', pt: 'Detalhes da Transcrição', pl: 'Szczegóły Transkrypcji', ru: 'Сведения о транскрипции' },
  'hub.tpl.assemblyai.transcript_details.desc': { en: 'Inspect a transcription job.', es: 'Inspecciona un trabajo de transcripción.', pt: 'Inspeciona um trabalho de transcrição.', pl: 'Sprawdź zadanie transkrypcji.', ru: 'Просмотр задания транскрипции.' },

  // ---- Secondary Supabase ----
  'hub.tpl.supabase_mkt.list_tables.label': { en: 'List Tables', es: 'Listar Tablas', pt: 'Listar Tabelas', pl: 'Lista Tabel', ru: 'Список таблиц' },
  'hub.tpl.supabase_mkt.list_tables.desc': { en: 'Public tables in the secondary project.', es: 'Tablas públicas del proyecto secundario.', pt: 'Tabelas públicas do projeto secundário.', pl: 'Tabele publiczne w drugim projekcie.', ru: 'Публичные таблицы вторичного проекта.' },
  'hub.tpl.supabase_mkt.list_rows.label': { en: 'List Rows', es: 'Listar Filas', pt: 'Listar Linhas', pl: 'Lista Wierszy', ru: 'Список строк' },
  'hub.tpl.supabase_mkt.list_rows.desc': { en: 'Rows from a chosen table.', es: 'Filas de una tabla elegida.', pt: 'Linhas de uma tabela escolhida.', pl: 'Wiersze z wybranej tabeli.', ru: 'Строки из выбранной таблицы.' },
  'hub.tpl.supabase_mkt.list_users.label': { en: 'List Users', es: 'Listar Usuarios', pt: 'Listar Usuários', pl: 'Lista Użytkowników', ru: 'Список пользователей' },
  'hub.tpl.supabase_mkt.list_users.desc': { en: 'Auth users in the secondary project.', es: 'Usuarios de autenticación del proyecto secundario.', pt: 'Usuários de autenticação do projeto secundário.', pl: 'Użytkownicy uwierzytelniania w drugim projekcie.', ru: 'Пользователи аутентификации вторичного проекта.' },
  'hub.tpl.supabase_mkt.list_buckets.label': { en: 'List Buckets', es: 'Listar Buckets', pt: 'Listar Buckets', pl: 'Lista Bucketów', ru: 'Список бакетов' },
  'hub.tpl.supabase_mkt.list_buckets.desc': { en: 'Storage buckets in the secondary project.', es: 'Buckets de almacenamiento del proyecto secundario.', pt: 'Buckets de armazenamento do projeto secundário.', pl: 'Buckety pamięci w drugim projekcie.', ru: 'Бакеты хранилища вторичного проекта.' },
}
