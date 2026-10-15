package br.com.nstech.lubrificacao.api;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Pool de conexões JDBC com Oracle Database.
 */
public final class ConnectionPool {

    private static final long VALIDATE_AFTER_IDLE_MS = 30000;
    private static final long MAX_IDLE_MS = 10 * 60000;

    public static final class Pooled {
        public final Connection con;
        long lastUsed = System.currentTimeMillis();

        Pooled(Connection con) {
            this.con = con;
        }
    }

    private final ApiConfig cfg;
    private final Semaphore permits;
    private final ConcurrentLinkedDeque<Pooled> idle = new ConcurrentLinkedDeque<Pooled>();
    private volatile boolean closed;

    public ConnectionPool(ApiConfig cfg) throws ClassNotFoundException {
        this.cfg = cfg;
        this.permits = new Semaphore(cfg.poolSize, true);
        Class.forName("oracle.jdbc.OracleDriver");
        DriverManager.setLoginTimeout(15);
    }

    public Pooled borrow() throws SQLException, InterruptedException {
        if (closed) throw new SQLException("Pool encerrado");
        if (!permits.tryAcquire(30, TimeUnit.SECONDS)) {
            throw new SQLException("Tempo esgotado aguardando conexão livre no pool Oracle");
        }
        try {
            Pooled p;
            while ((p = idle.pollFirst()) != null) {
                long idleMs = System.currentTimeMillis() - p.lastUsed;
                if (idleMs > MAX_IDLE_MS || (idleMs > VALIDATE_AFTER_IDLE_MS && !isValid(p.con))) {
                    closeQuietly(p.con);
                    continue;
                }
                return p;
            }
            return new Pooled(open());
        } catch (SQLException e) {
            permits.release();
            throw e;
        } catch (RuntimeException e) {
            permits.release();
            throw e;
        }
    }

    public void release(Pooled p, boolean broken) {
        try {
            if (broken || closed) {
                closeQuietly(p.con);
            } else {
                p.lastUsed = System.currentTimeMillis();
                idle.offerFirst(p);
            }
        } finally {
            permits.release();
        }
    }

    public void close() {
        closed = true;
        Pooled p;
        while ((p = idle.pollFirst()) != null) {
            closeQuietly(p.con);
        }
    }

    private Connection open() throws SQLException {
        Properties props = new Properties();
        props.setProperty("user", cfg.dbUser);
        props.setProperty("password", cfg.dbPassword);
        props.setProperty("oracle.jdbc.ReadTimeout", String.valueOf((cfg.queryTimeoutSeconds + 60) * 1000L));
        props.setProperty("oracle.net.CONNECT_TIMEOUT", "15000");

        Connection con = DriverManager.getConnection(cfg.dbUrl, props);
        Statement st = null;
        try {
            st = con.createStatement();
            st.execute("alter session set nls_date_format='yyyy-mm-dd hh24:mi:ss'");
            st.execute("alter session set nls_timestamp_format='yyyy-mm-dd hh24:mi:ss'");
            st.execute("alter session set NLS_NUMERIC_CHARACTERS = '. '");
        } catch (SQLException e) {
            closeQuietly(con);
            throw e;
        } finally {
            if (st != null) try { st.close(); } catch (SQLException ignore) { }
        }
        return con;
    }

    public static boolean isValid(Connection c) {
        try {
            return c != null && !c.isClosed() && c.isValid(5);
        } catch (Throwable t) {
            return false;
        }
    }

    public static void closeQuietly(Connection c) {
        try {
            if (c != null) c.close();
        } catch (Throwable ignore) {
        }
    }
}
