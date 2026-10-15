const { execute } = require('./server/config/database');

async function setupCatalog() {
  console.log('Inserindo categorias...');
  const categorias = [
    ['Óleo de Motor Diesel', 'Lubrificantes para motores a diesel pesado e médio', 'MOTOR'],
    ['Óleo de Motor Flex / Gasolina', 'Lubrificantes para motores leves flex, gasolina e etanol', 'MOTOR'],
    ['Óleo de Transmissão / Câmbio', 'Fluidos para câmbios manuais e automáticos', 'TRANSMISSAO'],
    ['Óleo de Diferencial / Tração', 'Fluidos para eixos diferenciais e redutores', 'DIFERENCIAL'],
    ['Graxas Lubrificantes', 'Graxas para chassis, cruzetas, cubos de roda e pinos', 'CHASSIS'],
    ['Filtro de Óleo Lubrificante', 'Elementos filtrantes de óleo de motor', 'FILTRO'],
    ['Filtro de Combustível / Separador', 'Filtros de diesel e gasolina e copos sedimentadores', 'FILTRO'],
    ['Filtro de Ar do Motor', 'Filtros de ar primário e secundário', 'FILTRO'],
    ['Filtro de Cabine / Ar Condicionado', 'Filtros de higienização de ar de cabine', 'FILTRO'],
    ['Fluido de Freio e Hidráulico', 'Fluidos DOT 4, ISO VG 68 e direção hidráulica', 'FLUIDO'],
    ['Líquido de Arrefecimento / Aditivo', 'Aditivos concentrados e prontos para uso', 'ARREFECIMENTO']
  ];

  for (const [nome, desc, tipo] of categorias) {
    const check = await execute('SELECT COUNT(*) AS CNT FROM LUB_CATEGORIAS_PRODUTO WHERE NOME_CATEGORIA = :1', [nome]);
    if (check.rows[0].CNT === 0) {
      await execute(
        `INSERT INTO LUB_CATEGORIAS_PRODUTO (NOME_CATEGORIA, DESCRICAO, TIPO_APLICACAO) VALUES (:1, :2, :3)`,
        [nome, desc, tipo]
      );
    }
  }

  const catRows = await execute('SELECT ID_CATEGORIA, NOME_CATEGORIA FROM LUB_CATEGORIAS_PRODUTO');
  console.log(`Categorias no banco: ${catRows.rows.length}`);
  const catMap = {};
  catRows.rows.forEach(c => { catMap[c.NOME_CATEGORIA] = c.ID_CATEGORIA; });

  const produtos = [
    ['Óleo de Motor Diesel', 'OLEO-15W40-D', 'Óleo Lubrax Top Turbo 15W40 Mineral (Diesel)', 'Lubrax / Petrobras', 'SAE 15W40 API CI-4/SL ACEA E7', 'LITRO', 800, 150, 26.50],
    ['Óleo de Motor Diesel', 'OLEO-10W40-D', 'Óleo Mobil Delvac MX ESP 10W40 Semissintético', 'Mobil', 'SAE 10W40 API CK-4/CJ-4', 'LITRO', 400, 80, 34.00],
    ['Óleo de Motor Flex / Gasolina', 'OLEO-5W30-S', 'Óleo Lubrax Valora 5W30 100% Sintético (Flex)', 'Lubrax / Petrobras', 'SAE 5W30 API SP / Dexos 1 Gen 3', 'LITRO', 350, 60, 38.00],
    ['Óleo de Motor Flex / Gasolina', 'OLEO-10W40-F', 'Óleo Shell Helix HX7 10W40 Semissintético', 'Shell', 'SAE 10W40 API SN / ACEA A3/B4', 'LITRO', 250, 50, 31.00],
    ['Óleo de Transmissão / Câmbio', 'OLEO-80W90-C', 'Óleo Lubrax Gear 80W90 Mineral Câmbio', 'Lubrax / Petrobras', 'SAE 80W90 API GL-4', 'LITRO', 200, 40, 28.00],
    ['Óleo de Diferencial / Tração', 'OLEO-85W140-D', 'Óleo Ipiranga Ipirgerol 85W140 Diferencial Pesado', 'Ipiranga', 'SAE 85W140 API GL-5', 'LITRO', 220, 40, 32.00],
    ['Graxas Lubrificantes', 'GRAXA-CHASSIS-AZ', 'Graxa Azul Lubrificante para Chassis NLGI 2', 'Lubrax / Mobil', 'Sabão de Lítio NLGI 2 com aditivos EP', 'KG', 120, 25, 24.00],
    ['Filtro de Óleo Lubrificante', 'FILT-OLEO-PESADO', 'Filtro de Óleo para Ônibus e Caminhões VW / MB', 'Mann Filter / Tecfil', 'Elemento Blindado / Refil Alta Eficiência', 'UNIDADE', 45, 10, 68.00],
    ['Filtro de Óleo Lubrificante', 'FILT-OLEO-LEVE', 'Filtro de Óleo Linha Leve e Utilitários', 'Tecfil / Fram', 'Blindado Linha Flex/Leve', 'UNIDADE', 60, 15, 32.00],
    ['Filtro de Combustível / Separador', 'FILT-COMB-SEP', 'Filtro Separador de Água / Combustível Sedimentador', 'Parker Racor / Mann', 'Elemento 30 Microns com dreno', 'UNIDADE', 40, 10, 75.00],
    ['Filtro de Ar do Motor', 'FILT-AR-PESADO', 'Filtro de Ar Primário Linha Pesada (Ônibus/Caminhão)', 'Mann Filter', 'Elemento Filtrante Cilíndrico', 'UNIDADE', 35, 8, 110.00],
    ['Filtro de Ar do Motor', 'FILT-AR-LEVE', 'Filtro de Ar Linha Leve / Utilitários', 'Tecfil', 'Painel Rígido Linha Leve', 'UNIDADE', 50, 12, 42.00],
    ['Fluido de Freio e Hidráulico', 'FLUIDO-DOT4', 'Fluido de Freio DOT 4 Alta Performance', 'Varga / Bosch', 'DOT 4 Ponto de Ebulição > 230°C', 'LITRO', 30, 10, 29.00],
    ['Líquido de Arrefecimento / Aditivo', 'ARREF-ORG', 'Aditivo de Radiador Orgânico Concentrado Rosa', 'Radiex / Paraflu', 'Base Monoetilenoglicol ABNT NBR 13705', 'LITRO', 100, 25, 27.50]
  ];

  for (const [catNome, cod, nome, marca, spec, unid, estoque, min, valor] of produtos) {
    const idCat = catMap[catNome] || catRows.rows[0].ID_CATEGORIA;
    const check = await execute('SELECT COUNT(*) AS CNT FROM LUB_PRODUTOS WHERE CODIGO_PRODUTO = :1', [cod]);
    if (check.rows[0].CNT === 0) {
      await execute(
        `INSERT INTO LUB_PRODUTOS (ID_CATEGORIA, CODIGO_PRODUTO, NOME_PRODUTO, MARCA, ESPECIFICACAO, UNIDADE_MEDIDA, ESTOQUE_ATUAL, ESTOQUE_MINIMO, VALOR_UNITARIO_ESTIMADO)
         VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9)`,
        [idCat, cod, nome, marca, spec, unid, estoque, min, valor]
      );
    }
  }

  const res = await execute('SELECT COUNT(*) AS TOTAL FROM LUB_PRODUTOS');
  console.log(`✅ Catálogo de produtos populado! Total de produtos no banco: ${res.rows[0].TOTAL}`);
}

setupCatalog();
