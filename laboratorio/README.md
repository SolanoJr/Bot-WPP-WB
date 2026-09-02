# Laboratório comportamental

O laboratório reúne apenas testes comportamentais que interagem com o bot real.
Testes unitários e de integração continuam em `tests/`.

## 📁 Arquivos

## Auto-teste

`selftest.ts` é executado somente quando `WPP_AUTOSELFTEST=1` e
`WPP_TEST_GROUP_ID` estão definidos. Ele testa respostas básicas e palavras-chave;
não executa ban, kick, mute, delete, promoção ou alteração de sessão.
Para cenários destrutivos, use testes unitários com alvos artificiais e a proteção
central de `isProtectedTarget`. Não existem scripts de produção que removam alvos
por IDs hardcoded.

## Teste HTTP local

O servidor de teste interno fica em `:3004` e aceita apenas `POST /test` com JSON:

```bash
curl -X POST http://127.0.0.1:3004/test \
	-H 'Content-Type: application/json' \
	-d '{"platform":"whatsapp","command":"$ping"}'
```

O endpoint escuta somente em `127.0.0.1`, serve para diagnóstico autorizado e não
substitui validação no grupo de laboratório `Teste`. Configure `WPP_TEST_CHAT_ID`
e `WPP_TEST_USER_ID` no ambiente de teste; sem eles o fallback é apenas o ID
canônico da sessão, não um grupo real.

---

**Última atualização:** 2026-09-01
