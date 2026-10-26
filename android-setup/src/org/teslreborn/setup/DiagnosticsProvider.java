package org.teslreborn.setup;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Read-only, temporary URI grants for explicitly exported reports only. */
public final class DiagnosticsProvider extends ContentProvider {
  @Override public boolean onCreate() { return true; }
  private File report(Uri uri) throws FileNotFoundException {
    if (!"content".equals(uri.getScheme())
        || !(getContext().getPackageName() + ".tesl-reborn-diagnostics").equals(uri.getAuthority())
        || uri.getPathSegments().size() != 1 || uri.getQuery() != null || uri.getFragment() != null)
      throw new FileNotFoundException("Invalid report URI");
    return DiagnosticsArchive.reportFile(new File(getContext().getCacheDir(), "diagnostic-reports"), uri.getLastPathSegment());
  }
  @Override public String getType(Uri uri) { return "application/zip"; }
  @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    if (!"r".equals(mode)) throw new FileNotFoundException("Report is read-only");
    return ParcelFileDescriptor.open(report(uri), ParcelFileDescriptor.MODE_READ_ONLY);
  }
  @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
    try {
      File file = report(uri);
      String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
      MatrixCursor cursor = new MatrixCursor(columns); Object[] row = new Object[columns.length];
      for (int i = 0; i < columns.length; i++) {
        if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) row[i] = "tesl-reborn-report.zip";
        else if (OpenableColumns.SIZE.equals(columns[i])) row[i] = file.length();
      }
      cursor.addRow(row); return cursor;
    } catch (FileNotFoundException missing) { return null; }
  }
  @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
  @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
  @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
