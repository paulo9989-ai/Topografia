# SIMAR-PE — MVP executável

MVP demonstrativo para monitoramento de condições meteorológicas e topográficas.
Inclui localização do navegador, previsão de chuva, elevação do terreno, mapa,
classificação experimental de risco e registro local de pedido de socorro.

## Requisitos
- Python 3.10+
- Navegador moderno
- Internet para carregar mapa e consultar APIs externas

## Executar sem Docker
1. Abra a pasta `simar-pe` no VS Code.
2. No terminal, crie e ative um ambiente virtual:

   Windows:
   ```powershell
   py -m venv .venv
   .venv\Scripts\activate
   ```

   Linux/macOS:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```
4. Inicie:
   ```bash
   uvicorn backend.main:app --reload
   ```
5. Abra `http://127.0.0.1:8000`.

## Executar com Docker
```bash
docker compose up --build
```
Depois acesse `http://localhost:8000`.

## O que já funciona
- Solicitação de localização pelo navegador (é necessário permitir).
- Consulta da previsão horária Open-Meteo.
- Consulta de elevação via Open-Elevation.
- Mapa topográfico como camada padrão usando OpenTopoMap (relevo/curvas de nível), com opção de alternar para mapa de ruas OpenStreetMap.
- Marcador de localização, mapa de calor de altitude baseado em uma grade 5x5 de consultas reais à Open-Elevation e grade demonstrativa de risco em camada separada.
- Interface responsiva para celular, tablet e desktop; controles do mapa e formulários adaptados ao toque.
- Indicador experimental baseado em chuva e inclinação estimada.
- Recomendações contextuais e registro de pedido de socorro na memória do servidor.

## Limitações importantes
- A classificação de risco é experimental e NÃO é um alerta oficial, nem substitui Defesa Civil.
- O mapa de calor representa as altitudes retornadas pela Open-Elevation em uma grade 5x5 (25 amostras) ao redor da localização. O cálculo de declividade usa amostras de elevação próximas e uma aproximação simples. Para uso real, é necessário um modelo digital de elevação validado, tratamento geoespacial e calibração por especialistas.
- Os alertas regionais oficiais da Defesa Civil/APAC ainda não estão integrados. A tela identifica claramente os dados meteorológicos como provenientes da Open-Meteo e não inventa alertas oficiais.
- O botão SOS apenas registra uma solicitação neste MVP. Ele NÃO chama Bombeiros, SAMU ou Defesa Civil. Em emergência real no Brasil, ligue 193 (Bombeiros), 192 (SAMU) ou 199 (Defesa Civil), conforme a situação.
- O endpoint Open-Elevation público pode ter limites ou indisponibilidade. Se falhar, a aplicação informa que a topografia não pôde ser consultada.

## Próximas evoluções
1. Integrar feeds oficiais APAC/INMET/Defesa Civil, após validar formatos e permissões.
2. Persistir histórico, usuários e ocorrências no PostgreSQL.
3. Substituir amostras pontuais por MDE (SRTM/ALOS) e análise geoespacial com PostGIS.
4. Validar e calibrar o modelo de risco com Defesa Civil e especialistas.
5. Implementar notificações push e fluxo autorizado de despacho de emergência.

## Sobre o mapa topográfico indicado
O site https://pt-br.topographic-map.com/map-cjsf3/Pernambuco/ é uma página interativa para consultar altitude e relevo de Pernambuco, mas não encontrei documentação pública de uma API/URL de tiles para incorporá-lo diretamente como camada Leaflet. Por isso, o MVP usa OpenTopoMap como camada topográfica, que permite manter o marcador GPS e a grade de risco no mesmo mapa. O site indicado continua disponível como referência externa.


## Camada de calor por altitude
A versão mobile exibe uma grade colorida de altitude sobre o mapa topográfico. A amostragem usa uma grade 7x7 (49 pontos) em uma área aproximada de 600 m x 600 m ao redor da localização. Verde indica menor altitude dentro da área amostrada, amarelo valores intermediários e vermelho maior altitude. A grade de risco é uma camada separada.
