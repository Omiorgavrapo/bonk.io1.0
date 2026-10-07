# Referência histórica e limites de fidelidade

## Versão escolhida

O ponto de partida histórico é o [HTML oficial arquivado em 3 de dezembro de 2025, 19:49:47 UTC](https://web.archive.org/web/20251203194947/https://bonk.io/gameframe-release.html), última captura de 2025 encontrada no índice consultado. O documento contém os seis modos pedidos, as telas de lobby, Guest Settings, Quick Play, Tutorial e editor. As descrições de Arrows e Grapple confirmam carregar/disparar flechas, a exclusão entre mirar e mover e a possibilidade de um oponente soltar o gancho.

O [site oficial](https://bonk.io/) e a [página oficial do jogo](https://bonk.io/gameframe-release.html) serviram para pesquisa complementar. O HTML histórico foi acessado, mas os estilos históricos e uma sessão jogável equivalente de 2025 não ficaram disponíveis para comparação completa. Cores/composição foram reconstruídas com esse HTML e estilos públicos atuais. Isso não certifica a aparência de 2025.

## Observado e reconstruído

| Parte | Evidência / limite |
|---|---|
| Seis nomes de modos e telas selecionadas | Presentes no HTML oficial arquivado de 2025. |
| Arrows / Grapple | Descrições no HTML histórico; constantes, alcance e temporizações permanecem estimados. |
| Física | Planck/Box2D com parâmetros estimados centralizados em `BonkCore.PARAMS`. Não houve medição pareada de quedas, massa, pesado ou colisões contra o jogo de 2025. |
| Interface e editor | Reconstrução funcional; sem comparação de capturas equivalentes pixel a pixel. O modo Adapted é um layout local solicitado pelo usuário. |
| Fonte e logo | Texto desenhado com Jost local. Não reproduz a fonte/logo original exatamente. |
| Skins e sons | Skins geométricas básicas e sons sintetizados desta implementação. Não são assets originais. |
| Mapas reais | Metadados oficiais com publicação anterior a 2026; dados atuais decodificados. Geometria histórica não certificada. Variantes de modo são declaradas em `MAPAS.md`. |

Os mapas foram consultados pelo serviço oficial [map_getsearch.php](https://bonk2.io/scripts/map_getsearch.php). O formato foi estudado com a [Bonk Map Library](https://github.com/PixelMelt/bonk-map); essa biblioteca e os bundles originais do jogo não fazem parte da distribuição. Os sete mapas reais e as 13 entradas correspondentes estão enumerados em `MAPAS.md`.

A entrega é uma reconstrução local utilizável e uma base para comparação/calibração. **Não deve ser descrita como uma réplica 1:1 confirmada ou como o catálogo completo de 2025.** Para comprovar isso ainda são necessários uma referência visual jogável de 2025, medições físicas equivalentes e testes no Chromebook alvo.
