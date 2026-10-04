package android.net;
import java.util.*;
/** Uri de mentira, só para o teste: guarda esquema, autoridade e parâmetros. */
public class Uri {
  public final String scheme, authority; public final Map<String,String> q;
  public Uri(String s, String a, Map<String,String> q) { scheme = s; authority = a; this.q = q; }
  public String getScheme() { return scheme; }
  public String getAuthority() { return authority; }
  public String getQueryParameter(String k) { return q.get(k); }
  public static final class Builder {
    String s, a; Map<String,String> q = new LinkedHashMap<>();
    public Builder scheme(String s) { this.s = s; return this; }
    public Builder authority(String a) { this.a = a; return this; }
    public Builder appendQueryParameter(String k, String v) { q.put(k, v); return this; }
    public Uri build() { return new Uri(s, a, q); }
  }
}
