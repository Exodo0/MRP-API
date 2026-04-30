# DefaultApi

All URIs are relative to *http://localhost:3000*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**v1SemoviLicensesPost**](DefaultApi.md#v1SemoviLicensesPost) | **POST** /v1/semovi/licenses | Asignar o remover licencia |


<a name="v1SemoviLicensesPost"></a>
# **v1SemoviLicensesPost**
> _v1_semovi_licenses_post_200_response v1SemoviLicensesPost(\_v1\_semovi\_licenses\_post\_request)

Asignar o remover licencia

    Asigna o remueve un rol de licencia en Discord y maneja el cobro automático si aplica.

### Parameters

|Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **\_v1\_semovi\_licenses\_post\_request** | [**_v1_semovi_licenses_post_request**](../Models/_v1_semovi_licenses_post_request.md)|  | |

### Return type

[**_v1_semovi_licenses_post_200_response**](../Models/_v1_semovi_licenses_post_200_response.md)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

