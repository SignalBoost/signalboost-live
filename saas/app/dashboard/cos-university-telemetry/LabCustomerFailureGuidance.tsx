'use client'
import { labFailureGuidance } from '@/lib/lab/labFailureGuidance'
const labels:Record<string,[string,string]>={
 en:['Failure diagnosis','Recovery guidance'],
 es:['Diagnóstico de fallos','Guía de recuperación'],
 pt:['Diagnóstico de falhas','Orientação de recuperação'],
 pl:['Diagnoza błędu','Wskazówki naprawcze'],
 ru:['Диагностика сбоя','Действия по восстановлению'],
 de:['Fehlerdiagnose','Hinweise zur Wiederherstellung'],
 fr:['Diagnostic d’échec','Conseils de récupération'],
 it:['Diagnosi errore','Indicazioni di ripristino'],
 ja:['障害診断','復旧のご案内'],
 ko:['오류 진단','복구 안내'],
 ar:['تشخيص العطل','إرشادات الاستعادة']
}
const guidance:Record<string,Record<string,string>>={
 es:{uncertain:'Compruebe el trabajo existente en el proveedor antes de repetir una operación de pago.',credentials:'Compruebe los permisos y la conexión; no comparta claves con soporte.',data:'Revise datos y modelo; confirme costos antes de otro intento.',provider:'Compruebe la cuenta y el trabajo del proveedor antes de otro intento.',platform:'Revise el historial y contacte al soporte con la referencia de ejecución.',other:'Revise el historial antes de repetir una operación de pago.'},
 pt:{uncertain:'Verifique o job existente antes de repetir um pedido pago.',credentials:'Verifique as permissões e a conexão; não compartilhe chaves.',data:'Revise dados e modelo e confirme custos antes de outra execução.',provider:'Verifique a conta e o job do provedor antes de repetir.',platform:'Consulte o histórico e envie a referência da execução ao suporte.',other:'Consulte o histórico antes de repetir uma operação paga.'},
 pl:{uncertain:'Sprawdź istniejące zadanie u dostawcy przed kolejną płatną próbą.',credentials:'Sprawdź uprawnienia i połączenie; nie udostępniaj kluczy.',data:'Sprawdź dane i model; potwierdź koszty przed nową próbą.',provider:'Sprawdź konto i zadanie u dostawcy.',platform:'Sprawdź historię i przekaż identyfikator zadania wsparciu.',other:'Przed ponowieniem płatnej operacji sprawdź historię.'},
 ru:{uncertain:'Проверьте существующее задание провайдера перед повторным платным запуском.',credentials:'Проверьте права и подключение, не передавайте ключи.',data:'Проверьте данные и модель, подтвердите расходы.',provider:'Проверьте аккаунт и статус задания провайдера.',platform:'Изучите историю и передайте номер запуска поддержке.',other:'Проверьте историю перед повторным платным запуском.'},
 de:{uncertain:'Vor erneutem kostenpflichtigen Versuch vorhandenen Anbieterjob prüfen.',credentials:'Berechtigungen und Verbindung prüfen; keine Schlüssel weitergeben.',data:'Daten und Modell prüfen; Kosten vor erneutem Versuch bestätigen.',provider:'Anbieterkonto und bestehenden Job prüfen.',platform:'Verlauf prüfen und Laufreferenz an Support senden.',other:'Vor erneutem kostenpflichtigen Versuch Verlauf prüfen.'},
 fr:{uncertain:'Vérifiez le travail existant chez le fournisseur avant une nouvelle opération payante.',credentials:'Vérifiez les droits et la connexion, ne partagez jamais vos clés.',data:'Vérifiez les données et le modèle, puis confirmez les frais.',provider:'Vérifiez le compte et le travail existant du fournisseur.',platform:'Consultez le journal et transmettez la référence au support.',other:'Vérifiez le journal avant une nouvelle opération payante.'},
 it:{uncertain:'Controlla il job esistente prima di ripetere una richiesta a pagamento.',credentials:'Controlla permessi e connessione; non condividere le chiavi.',data:'Verifica dati e modello e conferma i costi.',provider:'Controlla account e job esistente del fornitore.',platform:'Esamina la cronologia e invia il riferimento al supporto.',other:'Controlla la cronologia prima di ripetere un’operazione a pagamento.'},
 ja:{uncertain:'有料操作を再実行する前に既存ジョブを確認してください。',credentials:'権限と接続を確認し、APIキーは共有しないでください。',data:'データとモデルを確認し、再実行の費用を承認してください。',provider:'プロバイダーのアカウントとジョブ状態を確認してください。',platform:'履歴と実行番号をサポートに伝えてください。',other:'有料操作を再実行する前に履歴を確認してください。'},
 ko:{uncertain:'유료 작업을 다시 시작하기 전에 기존 공급자 작업을 확인하세요.',credentials:'권한과 연결을 확인하고 API 키를 공유하지 마세요.',data:'데이터와 모델을 확인하고 재실행 비용을 승인하세요.',provider:'공급자 계정과 기존 작업 상태를 확인하세요.',platform:'실행 기록과 참조 번호를 지원팀에 전달하세요.',other:'유료 작업 재시도 전에 기록을 확인하세요.'},
 ar:{uncertain:'تحقق من المهمة الحالية لدى المزود قبل تكرار أي إجراء مدفوع.',credentials:'تحقق من الصلاحيات والاتصال ولا تشارك المفاتيح.',data:'راجع البيانات والنموذج وأكد التكلفة قبل إعادة التشغيل.',provider:'تحقق من حساب المزود وحالة المهمة الحالية.',platform:'راجع السجل وقدم مرجع التشغيل للدعم.',other:'راجع السجل قبل تكرار أي إجراء مدفوع.'}
}
export default function LabCustomerFailureGuidance({code,language}:{code:string;language:string}){
 const result=labFailureGuidance(code)
 const l=labels[language]??labels.en
 return <aside className="mt-2 rounded border border-amber-400/40 p-2 text-xs">
 <strong>{l[0]}: {result.category}</strong>
 <p className="mt-1">{l[1]}: {guidance[language]?.[result.category]??result.nextStep}</p>
 </aside>
}
