# SMC Controle de Lubrificação - API Oracle Tomcat

Backend Java (WAR) para execução no **Apache Tomcat** (8.5, 9 ou 10+ com javax / Tomcat 9 recomendado), responsável pela ponte de dados segura entre o Oracle Database local (`192.168.2.136:1521/xe`) e a aplicação web Node.js hospedada na nuvem (ex: **Render**).

---

## 🚀 Como Fazer o Deploy no Tomcat

### 1. Copiar o arquivo de Contexto
Copie o arquivo `deploy/lubrificacao-api.xml` para a pasta de contextos do seu Tomcat:
```bash
cp deploy/lubrificacao-api.xml $CATALINA_BASE/conf/Catalina/localhost/lubrificacao-api.xml
```

*Verifique se as credenciais de banco e a chave `API_SECRET` estão corretas no arquivo XML.*

### 2. Copiar o WAR
Copie o arquivo `deploy/lubrificacao-api.war` para a pasta `webapps` do Tomcat:
```bash
cp deploy/lubrificacao-api.war $CATALINA_BASE/webapps/lubrificacao-api.war
```

O Tomcat fará o deploy automático e disponibilizará a API em:
```
http://SEU_IP_OU_DDNS:8080/lubrificacao-api/api/
```

---

## 🔒 Segurança e Autenticação

Todas as rotas de banco de dados (`/ping`, `/sql`, `/execute`, `/query`) exigem autenticação:
1. **Bearer Token:**
   ```
   Authorization: Bearer <API_SECRET>
   ```
2. **HMAC-SHA256 (Padrão NSTECH):**
   ```
   X-Lubrificacao-Timestamp: <timestamp_em_milissegundos>
   X-Lubrificacao-Signature: <hmac_sha256(timestamp + "\n" + method + "\n" + uri + "\n" + body)>
   ```

Apenas o endpoint de verificação `/api/health` é público para monitoramento do Render/Uptime.

---

## 📡 Endpoints Disponíveis

| Método | Endpoint | Autenticado | Descrição |
|---|---|---|---|
| `GET` | `/api/health` | Não | Retorna o status da API (`{"status":"ok"}`) |
| `GET` | `/api/ping` | Sim | Testa a conexão com o Oracle (`SELECT 1 FROM DUAL`) |
| `POST` | `/api/sql` | Sim | Executa consulta ou comando SQL dinâmico com binds |
| `POST` | `/api/execute` | Sim | Alias para `/api/sql` |
| `POST` | `/api/query` | Sim | Alias para `/api/sql` |

### Exemplo de Chamada POST `/api/sql`:

**Corpo (JSON):**
```json
{
  "sql": "SELECT CODIGO_VEICULO, PLACA_VEICULO, MODELO_VEICULO FROM NST_VEICULOS WHERE SITUACAO = :1 AND ROWNUM <= :2",
  "binds": ["ATIVO", 5]
}
```

**Resposta (JSON):**
```json
{
  "rows": [
    {
      "CODIGO_VEICULO": "001",
      "PLACA_VEICULO": "ABC1D23",
      "MODELO_VEICULO": "GOL 1.0"
    }
  ],
  "rowsAffected": 0
}
```

---

## 🛠️ Recompilação com Maven

Caso altere qualquer código Java em `src/main/java`:
```bash
cd tomcat-api
mvn clean package -DskipTests
cp target/lubrificacao-api.war deploy/lubrificacao-api.war
```
