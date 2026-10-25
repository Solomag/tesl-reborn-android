package org.teslreborn.setup;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.hardware.camera2.*;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.util.Size;
import android.view.*;
import android.widget.*;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import java.nio.ByteBuffer;
import java.util.*;

/** In-app QR scanner. Frames are decoded locally; no images are saved or uploaded. */
public final class ScanActivity extends Activity implements SurfaceHolder.Callback {
  private CameraDevice camera;
  private CameraCaptureSession session;
  private ImageReader reader;
  private HandlerThread thread;
  private Handler handler;
  private SurfaceView preview;
  private volatile boolean done = false;
  private boolean opening = false;
  private long lastFrame = 0;
  private int generation = 0;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    FrameLayout box = new FrameLayout(this);
    preview = new SurfaceView(this);
    box.addView(preview);
    TextView hint = new TextView(this);
    hint.setText("Point the camera at the QR code in TESL Reborn Builder");
    hint.setTextSize(20);
    hint.setTextColor(0xffffffff);
    hint.setBackgroundColor(0x99000000);
    hint.setPadding(20, 30, 20, 30);
    box.addView(hint);
    setContentView(box);
    preview.getHolder().addCallback(this);
    if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
      requestPermissions(new String[] {Manifest.permission.CAMERA}, 1);
  }

  @Override
  public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
    super.onRequestPermissionsResult(request, permissions, grants);
    if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) open();
    else
      failure(
          "Camera permission was denied. You can enter the address and connection code manually.");
  }

  @Override
  public void surfaceCreated(SurfaceHolder holder) {
    open();
  }

  @Override
  public void surfaceChanged(SurfaceHolder h, int f, int w, int x) {}

  @Override
  public void surfaceDestroyed(SurfaceHolder holder) {
    closeCamera();
  }

  @Override
  protected void onResume() {
    super.onResume();
    done = false;
    if (preview != null) open();
  }

  private void open() {
    if (done
        || camera != null
        || opening
        || !preview.getHolder().getSurface().isValid()
        || checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
      return;
    opening = true;
    final int ticket = ++generation;
    thread = new HandlerThread("tesl-qr");
    thread.start();
    handler = new Handler(thread.getLooper());
    try {
      CameraManager manager = (CameraManager) getSystemService(CAMERA_SERVICE);
      String id = null;
      Size chosen = null;
      for (String candidate : manager.getCameraIdList()) {
        CameraCharacteristics info = manager.getCameraCharacteristics(candidate);
        Integer facing = info.get(CameraCharacteristics.LENS_FACING);
        if (facing == null || facing != CameraCharacteristics.LENS_FACING_BACK) continue;
        Size[] sizes =
            info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                .getOutputSizes(ImageFormat.YUV_420_888);
        for (Size size : sizes)
          if (size.getWidth() <= 1280
              && size.getHeight() <= 960
              && (chosen == null
                  || size.getWidth() * size.getHeight() > chosen.getWidth() * chosen.getHeight()))
            chosen = size;
        if (chosen != null) {
          id = candidate;
          break;
        }
      }
      if (id == null) throw new Exception("No supported rear camera");
      reader =
          ImageReader.newInstance(
              chosen.getWidth(), chosen.getHeight(), ImageFormat.YUV_420_888, 2);
      reader.setOnImageAvailableListener(r -> decode(r), handler);
      manager.openCamera(
          id,
          new CameraDevice.StateCallback() {
            public void onOpened(CameraDevice value) {
              opening = false;
              if (done || ticket != generation) {
                value.close();
                return;
              }
              camera = value;
              try {
                final Surface screen = preview.getHolder().getSurface();
                camera.createCaptureSession(
                    Arrays.asList(screen, reader.getSurface()),
                    new CameraCaptureSession.StateCallback() {
                      public void onConfigured(CameraCaptureSession value) {
                        if (done || ticket != generation || camera == null) {
                          value.close();
                          return;
                        }
                        session = value;
                        try {
                          CaptureRequest.Builder request =
                              camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                          request.addTarget(screen);
                          request.addTarget(reader.getSurface());
                          request.set(
                              CaptureRequest.CONTROL_AF_MODE,
                              CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                          session.setRepeatingRequest(request.build(), null, handler);
                        } catch (Exception e) {
                          failure(e.getMessage());
                        }
                      }

                      public void onConfigureFailed(CameraCaptureSession s) {
                        failure("Cannot start camera preview");
                      }
                    },
                    handler);
              } catch (Exception e) {
                failure(e.getMessage());
              }
            }

            public void onDisconnected(CameraDevice c) {
              c.close();
              failure("Camera disconnected");
            }

            public void onError(CameraDevice c, int e) {
              c.close();
              failure("Camera error " + e);
            }
          },
          handler);
    } catch (Exception e) {
      failure(e.getMessage());
    }
  }

  private void decode(ImageReader r) {
    try (Image image = r.acquireLatestImage()) {
      if (image == null || done || System.currentTimeMillis() - lastFrame < 250) return;
      lastFrame = System.currentTimeMillis();
      int width = image.getWidth(), height = image.getHeight();
      Image.Plane plane = image.getPlanes()[0];
      ByteBuffer source = plane.getBuffer();
      byte[] y = new byte[width * height];
      int start = source.position();
      for (int row = 0; row < height; row++)
        for (int col = 0; col < width; col++)
          y[row * width + col] =
              source.get(start + row * plane.getRowStride() + col * plane.getPixelStride());
      LuminanceSource luma =
          new PlanarYUVLuminanceSource(y, width, height, 0, 0, width, height, false);
      QRCodeReader qr = new QRCodeReader();
      Result result = qr.decode(new BinaryBitmap(new HybridBinarizer(luma)));
      Uri uri = Uri.parse(result.getText());
      if (!"teslreborn".equals(uri.getScheme())
          || !"resources".equals(uri.getHost())
          || uri.getQueryParameter("url") == null
          || uri.getQueryParameter("token") == null) return;
      PackInstaller.baseUrl(uri.getQueryParameter("url"));
      done = true;
      runOnUiThread(
          () -> {
            setResult(RESULT_OK, new Intent().setData(uri));
            finish();
          });
    } catch (Exception ignored) {
      /* Continue scanning until one valid connection QR is found. */
    }
  }

  private void failure(String text) {
    runOnUiThread(
        () -> {
          if (isFinishing() || isDestroyed()) return;
          done = true;
          closeCamera();
          new AlertDialog.Builder(this)
              .setMessage(text)
              .setPositiveButton("OK", (d, w) -> finish())
              .show();
        });
  }

  private void closeCamera() {
    generation++;
    done = true;
    if (session != null) {
      session.close();
      session = null;
    }
    if (camera != null) {
      camera.close();
      camera = null;
    }
    if (reader != null) {
      reader.close();
      reader = null;
    }
    if (thread != null) {
      thread.quitSafely();
      thread = null;
    }
    opening = false;
  }

  @Override
  protected void onPause() {
    closeCamera();
    super.onPause();
  }
}
