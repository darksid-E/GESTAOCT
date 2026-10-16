-- =====================================================================
-- FOTOS PRIVADAS: só usuários logados com a página Reparos veem as fotos.
-- Rode SOMENTE DEPOIS de publicar a versão do app que exibe as fotos por URL
-- assinada (js/fotos.js) e de rodar 20261016_01_seguranca_dominio_indices_storage.sql.
-- Para voltar atrás: update storage.buckets set public = true where id = 'fotos_reparos';
-- =====================================================================
update storage.buckets set public = false where id = 'fotos_reparos';
