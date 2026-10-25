package org.teslreborn.setup;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
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
public final class ScanActivity extends Activity implements TextureView.SurfaceTextureListener {
  private CameraDevice camera;
  private CameraCaptureSession session;
  private ImageReader reader;
  private HandlerThread thread;
  private Handler handler;
  private TextureView preview;
  private Surface cameraSurface;
  private final Handler main = new Handler(Looper.getMainLooper());
  private FrameLayout container;
  private Size previewSize;
  private int sensorRotation;
  private volatile boolean done = false;
  private boolean opening = false;
  private boolean resumed = false;
  private long lastFrame = 0;
  private int generation = 0;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    FrameLayout box = new FrameLayout(this);
    container = box;
    box.setBackgroundColor(0xff000000);
    preview = new TextureView(this);
    box.addView(preview, new FrameLayout.LayoutParams(-1, -1));
    box.setClipChildren(true);
    TextView hint = new TextView(this);
    hint.setText("Point the camera at the QR code in TESL Reborn Builder");
    hint.setTextSize(20);
    hint.setTextColor(0xffffffff);
    hint.setBackgroundColor(0x99000000);
    hint.setPadding(20, 30, 20, 30);
    box.addView(hint);
    setContentView(box);
    preview.setSurfaceTextureListener(this);
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
  public void onSurfaceTextureAvailable(SurfaceTexture texture, int width, int height) {
    if (resumed) {
      done = false;
      open();
    }
  }

  @Override
  public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int width, int height) {
    fitPreview();
  }

  @Override
  public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) {
    closeCamera();
    return true;
  }

  @Override
  public void onSurfaceTextureUpdated(SurfaceTexture texture) {}

  @Override
  protected void onResume() {
    super.onResume();
    resumed = true;
    done = false;
    if (preview != null) open();
  }

  private void open() {
    if (done
        || !resumed
        || camera != null
        || opening
        || !preview.isAvailable()
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
        Size[] surfaces =
            info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                .getOutputSizes(SurfaceTexture.class);
        for (Size size : sizes)
          if (surfaces != null
              && Arrays.asList(surfaces).contains(size)
              && size.getWidth() <= 1280
              && size.getHeight() <= 960
              && (chosen == null
                  || size.getWidth() * size.getHeight() > chosen.getWidth() * chosen.getHeight()))
            chosen = size;
        if (chosen != null) {
          id = candidate;
          Integer orientation = info.get(CameraCharacteristics.SENSOR_ORIENTATION);
          sensorRotation = orientation == null ? 0 : orientation;
          break;
        }
      }
      if (id == null) throw new Exception("No supported rear camera");
      previewSize = chosen;
      // Configure the buffer before wrapping it. Capture and request keep these
      // exact Surface instances for their whole session; layout changes only
      // change the TextureView matrix, never the camera outputs.
      preview.getSurfaceTexture().setDefaultBufferSize(chosen.getWidth(), chosen.getHeight());
      cameraSurface = new Surface(preview.getSurfaceTexture());
      fitPreview();
      reader =
          ImageReader.newInstance(
              chosen.getWidth(), chosen.getHeight(), ImageFormat.YUV_420_888, 2);
      reader.setOnImageAvailableListener(r -> decode(r), handler);
      manager.openCamera(
          id,
          new CameraDevice.StateCallback() {
            public void onOpened(CameraDevice value) {
              if (done || ticket != generation) {
                value.close();
                return;
              }
              opening = false;
              camera = value;
              try {
                final Surface screen = cameraSurface;
                final Surface frames = reader.getSurface();
                camera.createCaptureSession(
                    Arrays.asList(screen, frames),
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
                          request.addTarget(frames);
                          request.set(
                              CaptureRequest.CONTROL_AF_MODE,
                              CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                          session.setRepeatingRequest(request.build(), null, handler);
                        } catch (Exception e) {
                          failure(e.getMessage());
                        }
                      }

                      public void onConfigureFailed(CameraCaptureSession s) {
                        s.close();
                        if (ticket == generation && !done) failure("Cannot start camera preview");
                      }
                    },
                    main);
              } catch (Exception e) {
                failure(e.getMessage());
              }
            }

            public void onDisconnected(CameraDevice c) {
              c.close();
              if (ticket == generation && !done) failure("Camera disconnected");
            }

            public void onError(CameraDevice c, int e) {
              c.close();
              if (ticket == generation && !done) failure("Camera error " + e);
            }
          },
          main);
    } catch (Exception e) {
      failure(e.getMessage());
    }
  }

  private void fitPreview() {
    if (previewSize == null || preview.getWidth() < 1 || preview.getHeight() < 1) return;
    int displayRotation = getWindowManager().getDefaultDisplay().getRotation() * 90;
    int rotation = (sensorRotation - displayRotation + 360) % 360;
    int width = preview.getWidth(), height = preview.getHeight();
    float[] source = {0, 0, width, 0, 0, height};
    float[] destination =
        PreviewSize.corners(
            width, height, previewSize.getWidth(), previewSize.getHeight(), rotation);
    Matrix transform = new Matrix();
    transform.setPolyToPoly(source, 0, destination, 0, 3);
    preview.setTransform(transform);
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
      Uri uri = Uri.parse(ConnectionLink.resourceUri(result.getText()));
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
    if (cameraSurface != null) {
      cameraSurface.release();
      cameraSurface = null;
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
    resumed = false;
    closeCamera();
    super.onPause();
  }
}
