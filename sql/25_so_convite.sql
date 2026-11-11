-- 25: Equipe só por convite (decisão de 11/11/2026). Pode rodar mais de uma vez.
-- O antigo "vincular pelo e-mail" saiu do app: o convite por link é mais simples (a pessoa só toca no link)
-- e mais seguro (não dá para tentar e-mails para descobrir quem tem conta).
drop function if exists vincular_usuario_por_email(text, text, text);
