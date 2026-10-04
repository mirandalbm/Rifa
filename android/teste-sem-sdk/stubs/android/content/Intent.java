package android.content;
public class Intent {
  public static final String ACTION_VIEW = "android.intent.action.VIEW";
  public static final int FLAG_ACTIVITY_NEW_TASK = 0x10000000;
  public final android.net.Uri data; public int flags;
  public Intent(String action, android.net.Uri uri) { data = uri; }
  public Intent addFlags(int f) { flags |= f; return this; }
  public ComponentName resolveActivity(android.content.pm.PackageManager pm) { return pm == null ? null : new ComponentName(); }
  public android.net.Uri getData() { return data; }
}
